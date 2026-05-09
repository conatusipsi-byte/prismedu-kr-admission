"use client";

import * as React from "react";

interface SkeletonWrapperProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}

export function SkeletonWrapper({ loading, skeleton, children }: SkeletonWrapperProps) {
  if (loading) return <>{skeleton}</>;
  return <div className="animate-fade-in">{children}</div>;
}
