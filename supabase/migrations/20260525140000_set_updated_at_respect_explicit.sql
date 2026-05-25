-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ set_updated_at() — 명시적 updated_at 변경 보존                              ║
-- ║                                                                       ║
-- ║ 기존: 모든 UPDATE 에 대해 무조건 NEW.updated_at = now() 로 덮어씀.            ║
-- ║   → ETL bulk import 가 row 별 distinct timestamp 를 부여하려 해도            ║
-- ║     트리거가 단일 now() 로 재고정 → cursor pagination 결정성 깨짐.             ║
-- ║                                                                       ║
-- ║ 변경: NEW.updated_at 이 OLD.updated_at 과 다르면 (= 호출자가 명시적으로     ║
-- ║       바꾼 것) 그 값 보존. 같으면 (= 호출자가 안 건드림) now() 로 자동 갱신.     ║
-- ║                                                                       ║
-- ║ 영향:                                                                  ║
-- ║   - 일반 UPDATE 동작 변화 없음 (updated_at 안 건드리는 코드는 같은 결과).      ║
-- ║   - ETL bulk import 가 row 별 timestamp 분산 가능.                          ║
-- ║   - 백필 마이그레이션 (20260525130000) 도 DISABLE TRIGGER 없이 사용 가능.    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    -- 호출자가 명시적으로 변경 → 보존
    RETURN NEW;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
