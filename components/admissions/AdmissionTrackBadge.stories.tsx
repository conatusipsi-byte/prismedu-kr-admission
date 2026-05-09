/**
 * AdmissionTrackBadge — Storybook 스토리 (9종 trackKind)
 *
 * @storybook/react 미설치 환경 대응 — 타입을 typeof 로 추론.
 * Storybook 도입 후 정식 Meta/StoryObj 타입으로 교체.
 */

import { AdmissionTrackBadge } from "./AdmissionTrackBadge";
import type { AdmissionTrackKind } from "@/types/admission";

const meta = {
  title: "admissions/AdmissionTrackBadge",
  component: AdmissionTrackBadge,
};
export default meta;

type Story = { args: Parameters<typeof AdmissionTrackBadge>[0] };

export const SusiSubject: Story = { args: { kind: "susi_subject" } };
export const SusiComprehensive: Story = { args: { kind: "susi_comprehensive" } };
export const SusiEssay: Story = { args: { kind: "susi_essay" } };
export const SusiPractical: Story = { args: { kind: "susi_practical" } };
export const JeongsiGa: Story = { args: { kind: "jeongsi_ga" } };
export const JeongsiNa: Story = { args: { kind: "jeongsi_na" } };
export const JeongsiDa: Story = { args: { kind: "jeongsi_da" } };

/** P-013 — 별도 색상 (purple) */
export const Jaeoegukmin: Story = { args: { kind: "jaeoegukmin" } };

/** 모든 kind 한 화면 비교 — 시각 분리 검수용 */
export const AllVariants = {
  render: () => {
    const kinds: AdmissionTrackKind[] = [
      "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
      "jeongsi_ga", "jeongsi_na", "jeongsi_da", "additional", "jaeoegukmin",
    ];
    return (
      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => <AdmissionTrackBadge key={k} kind={k} />)}
      </div>
    );
  },
};
