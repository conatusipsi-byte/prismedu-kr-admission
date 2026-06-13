-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ search_admissions_v2 — p_special_type 필터 추가 (2026-06-13)                 ║
-- ║                                                                       ║
-- ║ 농어촌(agricultural)·기회균형(low_income)·특성화 등(etc) 특별전형 필터.            ║
-- ║ specialType 은 available_track_kinds(kind) 가 아니라 tracks jsonb 안에 있으므로  ║
-- ║ EXISTS(jsonb_each→jsonb_array_elements) 로 검사. p_special_type DEFAULT NULL ║
-- ║ → 미지정 시 기존 동작 100% 동일(회귀 검증: no_filter 9063 불변).                  ║
-- ║                                                                       ║
-- ║ 시그니처 변경(9→10 args)이라 DROP+CREATE. DEFAULT NULL 이라 구 라우트(9 named   ║
-- ║ args)도 신함수에 그대로 매칭 → 무중단.                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.search_admissions_v2(text[], text, text[], text[], text, text, int, int, int);

CREATE OR REPLACE FUNCTION public.search_admissions_v2(
  p_category text[] DEFAULT NULL,
  p_track text DEFAULT NULL,
  p_track_category text[] DEFAULT NULL,
  p_track_kind text[] DEFAULT NULL,
  p_special_type text[] DEFAULT NULL,
  p_keyword text DEFAULT NULL,
  p_degree_course text DEFAULT '학사',
  p_year int DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id text, university_id text, campus_id text, name text, name_en text, unit_type text, track text,
  total_quota int, sub_departments text[], is_professional boolean, professional_type text, active boolean,
  updated_at timestamptz, kedi_mjr_id text, universities jsonb, department_admissions jsonb, univ_rank bigint
)
LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_keyword_pattern text;
BEGIN
  IF p_keyword IS NOT NULL AND length(trim(p_keyword)) > 0 THEN
    v_keyword_pattern := '%' ||
      replace(replace(replace(trim(p_keyword), '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
         WHERE da.university_id = d.university_id AND da.department_id = d.id),
        '[]'::jsonb
      ) AS department_admissions
    FROM departments d
    JOIN universities u ON u.id = d.university_id
    WHERE d.active = true
      AND u.active = true
      AND d.name NOT ILIKE '기타%'
      AND (
        p_degree_course IS NULL OR p_degree_course = 'all'
        OR d.degree_course = p_degree_course OR d.degree_course IS NULL
      )
      AND (d.daytime = '주간' OR d.daytime IS NULL)
      AND (p_category IS NULL OR u.category = ANY(p_category))
      AND (p_track IS NULL OR d.track = p_track)
      AND (p_track_category IS NULL OR d.track = ANY(p_track_category))
      AND (
        p_track_kind IS NULL OR EXISTS (
          SELECT 1 FROM department_admissions da
          WHERE da.university_id = d.university_id AND da.department_id = d.id
            AND da.year = COALESCE(p_year, EXTRACT(YEAR FROM NOW())::int + 1)
            AND da.available_track_kinds && p_track_kind
        )
      )
      -- 특별전형(specialType) — tracks jsonb 안의 각 트랙 specialType 검사.
      AND (
        p_special_type IS NULL OR EXISTS (
          SELECT 1 FROM department_admissions da3
          CROSS JOIN LATERAL jsonb_each(da3.tracks) AS je(kind, arr)
          CROSS JOIN LATERAL jsonb_array_elements(je.arr) AS el(trk)
          WHERE da3.university_id = d.university_id AND da3.department_id = d.id
            AND da3.year = COALESCE(p_year, EXTRACT(YEAR FROM NOW())::int + 1)
            AND el.trk->>'specialType' = ANY(p_special_type)
        )
      )
      AND (
        v_keyword_pattern IS NULL
        OR d.name ILIKE v_keyword_pattern ESCAPE '\'
        OR u.n ILIKE v_keyword_pattern ESCAPE '\'
        OR u.short_name ILIKE v_keyword_pattern ESCAPE '\'
        OR u.name_en ILIKE v_keyword_pattern ESCAPE '\'
      )
  ),
  ranked AS (
    SELECT f.*, ROW_NUMBER() OVER (PARTITION BY f.university_id ORDER BY f.id) AS univ_rank
    FROM filtered f
  )
  SELECT
    r.id, r.university_id, r.campus_id, r.name, r.name_en,
    r.unit_type, r.track, r.total_quota, r.sub_departments,
    r.is_professional, r.professional_type, r.active,
    r.updated_at, r.kedi_mjr_id, r.universities, r.department_admissions, r.univ_rank
  FROM ranked r
  ORDER BY r.univ_rank ASC, r.university_id ASC, r.id ASC
  OFFSET p_offset LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_admissions_v2(text[], text, text[], text[], text[], text, text, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admissions_v2(text[], text, text[], text[], text[], text, text, int, int, int)
  TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.search_admissions_v2(text[], text, text[], text[], text[], text, text, int, int, int) IS
  '학과 검색 라운드로빈 + p_special_type(농어촌/기회균형/특성화) 필터(2026-06-13). specialType 은 tracks jsonb 검사.';
