-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ search_admissions_v2 — 학과 검색 RPC (BUG-020 round-robin)                  ║
-- ║                                                                       ║
-- ║ 결함: 분산 마이그레이션 후 (university_id, id) 사전순 1ms 슬롯 부여 →           ║
-- ║       특정 학교 (max updated_at 가장 늦은) 가 page 1 전부 점유.                ║
-- ║                                                                       ║
-- ║ 수정: ROW_NUMBER() OVER (PARTITION BY university_id ORDER BY id) 로        ║
-- ║       학교 내 학과 순위 (univ_rank) 부여. ORDER BY (univ_rank, ...)         ║
-- ║       → page 1 = 모든 매칭 학교의 1번 학과 (라운드로빈).                       ║
-- ║                                                                       ║
-- ║ 모든 기존 필터 (active / 기타제외 / category / track / trackKind /             ║
-- ║   degreeCourse / daytime / keyword) 처리. dedup 과 jaeoegukmin display    ║
-- ║   strip 은 route.ts 후처리 유지 (per-page 동작이라 RPC 외부 OK).              ║
-- ║                                                                       ║
-- ║ 반환: department row + universities embed + department_admissions[]       ║
-- ║   각자 jsonb. route.ts 의 Row 타입과 1:1 매핑.                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.search_admissions_v2(
  p_category text[] DEFAULT NULL,
  p_track text DEFAULT NULL,
  p_track_category text[] DEFAULT NULL,
  p_track_kind text[] DEFAULT NULL,
  p_keyword text DEFAULT NULL,
  p_degree_course text DEFAULT '학사',
  p_year int DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id text,
  university_id text,
  campus_id text,
  name text,
  name_en text,
  unit_type text,
  track text,
  total_quota int,
  sub_departments text[],
  is_professional boolean,
  professional_type text,
  active boolean,
  updated_at timestamptz,
  kedi_mjr_id text,
  universities jsonb,
  department_admissions jsonb,
  univ_rank bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_keyword_pattern text;
BEGIN
  -- 키워드 ILIKE 패턴 — SQL wildcard (% / _) 이스케이프 후 %wrap%
  IF p_keyword IS NOT NULL AND length(trim(p_keyword)) > 0 THEN
    v_keyword_pattern := '%' ||
      replace(replace(replace(trim(p_keyword), '\', '\\'), '%', '\%'), '_', '\_') ||
      '%';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      d.id, d.university_id, d.campus_id, d.name, d.name_en,
      d.unit_type, d.track, d.total_quota, d.sub_departments,
      d.is_professional, d.professional_type, d.active,
      d.updated_at, d.kedi_mjr_id,
      to_jsonb(u.*) AS universities,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
                 'year', da.year,
                 'available_track_kinds', da.available_track_kinds))
         FROM department_admissions da
         WHERE da.university_id = d.university_id
           AND da.department_id = d.id),
        '[]'::jsonb
      ) AS department_admissions
    FROM departments d
    JOIN universities u ON u.id = d.university_id
    WHERE d.active = true
      AND u.active = true
      -- BUG-019: KCUE 메타 분류 제외
      AND d.name NOT ILIKE '기타%'
      -- 학위과정 (default '학사', 'all' 또는 NULL 이면 미적용)
      AND (
        p_degree_course IS NULL
        OR p_degree_course = 'all'
        OR d.degree_course = p_degree_course
        OR d.degree_course IS NULL
      )
      -- 야간 제외 (always)
      AND (d.daytime = '주간' OR d.daytime IS NULL)
      -- category 다중
      AND (p_category IS NULL OR u.category = ANY(p_category))
      -- track 단일
      AND (p_track IS NULL OR d.track = p_track)
      -- trackCategory 다중
      AND (p_track_category IS NULL OR d.track = ANY(p_track_category))
      -- trackKind — department_admissions inner join + overlaps
      AND (
        p_track_kind IS NULL OR EXISTS (
          SELECT 1 FROM department_admissions da
          WHERE da.university_id = d.university_id
            AND da.department_id = d.id
            AND da.year = COALESCE(p_year, EXTRACT(YEAR FROM NOW())::int + 1)
            AND da.available_track_kinds && p_track_kind
        )
      )
      -- 키워드 — universities.n / short_name / name_en / departments.name ILIKE
      AND (
        v_keyword_pattern IS NULL
        OR d.name ILIKE v_keyword_pattern ESCAPE '\'
        OR u.n ILIKE v_keyword_pattern ESCAPE '\'
        OR u.short_name ILIKE v_keyword_pattern ESCAPE '\'
        OR u.name_en ILIKE v_keyword_pattern ESCAPE '\'
      )
  ),
  ranked AS (
    SELECT f.*,
      ROW_NUMBER() OVER (PARTITION BY f.university_id ORDER BY f.id) AS univ_rank
    FROM filtered f
  )
  SELECT
    r.id, r.university_id, r.campus_id, r.name, r.name_en,
    r.unit_type, r.track, r.total_quota, r.sub_departments,
    r.is_professional, r.professional_type, r.active,
    r.updated_at, r.kedi_mjr_id,
    r.universities,
    r.department_admissions,
    r.univ_rank
  FROM ranked r
  ORDER BY r.univ_rank ASC, r.university_id ASC, r.id ASC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_admissions_v2(text[], text, text[], text[], text, text, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admissions_v2(text[], text, text[], text[], text, text, int, int, int)
  TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.search_admissions_v2(text[], text, text[], text[], text, text, int, int, int) IS
  'BUG-020 (QA round 3) — 학과 검색 라운드로빈. ROW_NUMBER OVER (PARTITION BY university_id) 로 page 1 다양성 보장. PostgREST 한계 우회.';
