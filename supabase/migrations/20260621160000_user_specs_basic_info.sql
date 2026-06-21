-- user_specs 에 기본정보(계열·출신고교) 영속화 — 분석마다 재입력 방지 (2026-06-21)
-- 기존: 온보딩 저장 시 track/highSchool 미저장(POST /api/user/specs 가 as_of·school_record·
--   csat·school_type 만 insert) → 모든 분석 폼(AnalysisFormWizardLoader)이 prefill 시
--   track:null·highSchool:null 로 두어 계열·고교를 매번 재선택해야 했음.
-- 수정: track·high_school 컬럼 추가 → 온보딩 저장 시 영속 → 전 분석 폼 prefill.
alter table public.user_specs add column if not exists track text;        -- 'humanities' | 'natural' | 'arts'
alter table public.user_specs add column if not exists high_school jsonb;  -- { code, name, region }
