"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { PhotoPicker } from "@/features/photos/components/PhotoPicker";
import type { TodayTask } from "../queries";
import { completeTaskAction } from "../actions";

const STATUS: Record<TodayTask["status"], { label: string; className: string }> = {
  done: { label: "✓ انعملت", className: "bg-ok-soft text-ok-text" },
  late: { label: "متأخرة", className: "bg-danger-soft text-danger-text" },
  open: { label: "لسا", className: "bg-quiet-strong text-muted" },
};

/** مهام اليوم للموظف: كل مهمة كرت، وزر "تمّت" (مع صورة إذا بدها). */
export function TaskChecklist({ tasks }: { tasks: TodayTask[] }) {
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-muted" aria-live="polite">
        خلصت {done} من {tasks.length}
      </p>
      <ul className="flex flex-col gap-3">
        {tasks.map((t) => (
          <li key={t.templateId}>
            <TaskCard task={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskCard({ task }: { task: TodayTask }) {
  const [note, setNote] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const status = STATUS[task.status];

  const submit = () => {
    if (task.requiresPhoto && !photoPath) return setError("صوّر أول، بعدين اكبس تمّت");
    setError(null);
    startTransition(async () => {
      const result = await completeTaskAction({ templateId: task.templateId, note, photoPath });
      if (result.status === "error") setError(result.message);
    });
  };

  return (
    <article
      aria-label={task.title}
      className={`flex flex-col gap-3 rounded-[18px] border bg-surface p-4 ${
        task.status === "late" ? "border-danger-line" : "border-line"
      }`}
    >
      <header className="flex items-start gap-2">
        <div className="flex grow flex-col gap-0.5">
          <h2 className="text-lg font-bold">{task.title}</h2>
          {task.description && <p className="text-[15px] text-muted">{task.description}</p>}
          <span className="text-sm text-muted">
            قبل الساعة <span dir="ltr">{task.dueTime}</span>
            {task.requiresPhoto && " · بدها صورة"}
          </span>
        </div>
        <span
          className={`shrink-0 rounded-[10px] px-2.5 py-0.5 text-[13px] font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </header>

      {task.status === "done" ? (
        <p className="text-[15px] text-ok-text">
          {task.doneBy ?? ""} الساعة <span dir="ltr">{task.doneAt}</span>
          {task.note && <span className="block text-muted">{task.note}</span>}
        </p>
      ) : (
        <>
          {task.requiresPhoto && (
            <PhotoPicker bucket="task-photos" label="صوّر الشغل" onUploaded={setPhotoPath} />
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">ملاحظة (إذا في)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className="h-12 rounded-xl border border-line bg-surface px-3 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <Button size="md" onClick={submit} disabled={isSaving}>
            {isSaving ? "لحظة…" : "تمّت"}
          </Button>
        </>
      )}
    </article>
  );
}
