"use client";

import { ErrorScreen } from "@/features/errors/ErrorScreen";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
