"use server";

import type { SaveResult } from "@/features/settings/actions";
import { updateOptionAction } from "./actions";

// أشكال جاهزة لـ InlineField و SavedSwitch (بياخذوا قيمة وحدة)

export async function updateOptionNameAction(optionId: string, value: string): Promise<SaveResult> {
  return updateOptionAction(optionId, "name", value);
}

export async function updateOptionTextAction(
  optionId: string,
  field: "description" | "icon",
  value: string,
): Promise<SaveResult> {
  if (field !== "description" && field !== "icon") return { status: "error", message: "الحقل مش موجود" };
  return updateOptionAction(optionId, field, value);
}

export async function setOptionActiveAction(
  optionId: string,
  field: "active" | "requiresNote",
  value: boolean,
): Promise<SaveResult> {
  if (field !== "active" && field !== "requiresNote") return { status: "error", message: "الحقل مش موجود" };
  return updateOptionAction(optionId, field, value);
}
