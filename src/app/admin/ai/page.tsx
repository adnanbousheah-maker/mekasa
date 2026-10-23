import { PageHeader } from "@/features/admin/components/AdminBits";
import { AssistantChat } from "@/features/assistant/components/AssistantChat";

// design/admin/AdminAI.dc.html (هون صفحة كاملة بدل اللوحة الجانبية)
export default function AssistantPage() {
  return (
    <>
      <PageHeader
        title="اسأل المساعد"
        subtitle="أسئلة عن ميكاسا بالأردني، والجواب من بيانات التطبيق مع مصدره"
      />
      <AssistantChat />
    </>
  );
}
