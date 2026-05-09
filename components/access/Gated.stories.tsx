/**
 * Gated 컴포넌트 — Storybook 스토리
 *
 * 4개 reason 케이스를 시각적으로 확인 가능. 디자인 검수 시 본 스토리북으로
 * "락 카드와 안내 카드의 시각적 분리"가 충분한지 평가.
 *
 * 스토리북 환경: prismedu.kr 패턴 그대로 (`@storybook/react` + Vite preset 가정).
 * Gated.test.tsx 는 본 스토리와 별개 — 단위 회귀 검증용.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { Gated } from "./Gated";
import { Card, CardContent } from "@/components/ui/card";

const SampleChildContent = () => (
  <Card>
    <CardContent className="py-8">
      <p className="text-sm font-medium">합격 확률 78%</p>
      <p className="text-xs text-muted-foreground">
        Reach · 신뢰구간 70~85%
      </p>
    </CardContent>
  </Card>
);

const meta = {
  title: "access/Gated",
  component: Gated,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "P-001 옵션 B 정책 wrapper. reason 별로 4가지 시각 분기 — paid/preview/insufficient/locked.",
      },
    },
  },
  args: {
    feature: "analysis",
    children: <SampleChildContent />,
  },
} satisfies Meta<typeof Gated>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ═══════════════════════════════════════════════════════════════════════
   1. paid_plan — children 그대로 렌더 (락 UI 없음)
   ═══════════════════════════════════════════════════════════════════════ */

export const PaidPlan: Story = {
  name: "1. paid_plan (유료 사용자)",
  args: {
    reason: "paid_plan",
  },
  parameters: {
    docs: {
      description: {
        story:
          "유료 사용자 또는 reason 미지정 시 — children 그대로. 락 UI 일절 없음.",
      },
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   2. in_free_preview — children + 카운터 배지
   ═══════════════════════════════════════════════════════════════════════ */

export const InFreePreview: Story = {
  name: "2. in_free_preview (무료 preview 컷 내)",
  args: {
    reason: "in_free_preview",
    previewCounter: { current: 5, max: 20 },
  },
  parameters: {
    docs: {
      description: {
        story:
          "무료 사용자 + free preview 20개 안에 포함된 학과. children 노출 + 우상단에 'N/M' 카운터.",
      },
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   3. insufficient_sample — 안내 카드 (회색 + 시계 + CTA 없음)
   ═══════════════════════════════════════════════════════════════════════ */

export const InsufficientSample: Story = {
  name: "3. insufficient_sample (P-001 핵심)",
  args: {
    reason: "insufficient_sample",
    sampleN: 2,
  },
  parameters: {
    docs: {
      description: {
        story:
          "표본 부족 학과. **결제 CTA 절대 노출 X** (P-001 옵션 B). 회색·시계 아이콘으로 락 카드와 시각적 분리.",
      },
    },
  },
};

export const InsufficientSampleNoCount: Story = {
  name: "3-b. insufficient_sample (sampleN 미지정)",
  args: {
    reason: "insufficient_sample",
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   4. free_plan_over_preview_quota — 락 카드 (mint + 자물쇠 + 업그레이드)
   ═══════════════════════════════════════════════════════════════════════ */

export const Locked: Story = {
  name: "4. free_plan_over_preview_quota (락)",
  args: {
    reason: "free_plan_over_preview_quota",
  },
  parameters: {
    docs: {
      description: {
        story:
          "표본 충족 학과 + 무료 사용자 + free preview 컷 외. mint 브랜드 컬러 + 자물쇠 아이콘 + 업그레이드 CTA.",
      },
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   비교 — 두 카드 시각적 분리 확인
   ═══════════════════════════════════════════════════════════════════════ */

export const SideBySideCompare: Story = {
  name: "비교: insufficient vs locked (디자인 분리 검수)",
  render: (args) => (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          insufficient_sample (회색 · 시계 · CTA 없음)
        </p>
        <Gated {...args} reason="insufficient_sample" sampleN={3} />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          free_plan_over_preview_quota (mint · 자물쇠 · 업그레이드)
        </p>
        <Gated {...args} reason="free_plan_over_preview_quota" />
      </div>
    </div>
  ),
};

/* ═══════════════════════════════════════════════════════════════════════
   feature 별 카피 검증
   ═══════════════════════════════════════════════════════════════════════ */

export const FeatureVariants: Story = {
  name: "feature 5종 락 카드 카피",
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      {(
        ["analysis", "autoPlanner", "compare", "whatIf", "aiCounselor"] as const
      ).map((f) => (
        <Gated key={f} feature={f} reason="free_plan_over_preview_quota">
          <SampleChildContent />
        </Gated>
      ))}
    </div>
  ),
};
