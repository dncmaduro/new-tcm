import { DetailInfoRow, DetailSidebar } from "@/components/detail-ui";
import {
  getTaskPriorityBadgeClassName,
  getTaskPriorityLabel,
} from "./utils";

type TaskMetaSidebarProps = {
  progress: number;
  priority: string;
  assigneeName: string;
  timelineLabel: string;
  creatorName: string;
  createdAtLabel: string;
  updatedAtLabel: string;
};

export function TaskMetaSidebar({
  progress,
  priority,
  assigneeName,
  timelineLabel,
  creatorName,
  createdAtLabel,
  updatedAtLabel,
}: TaskMetaSidebarProps) {
  return (
    <DetailSidebar title="Thông tin chi tiết">
      <DetailInfoRow label="Người phụ trách" value={assigneeName} />
      <DetailInfoRow label="Tiến độ (%)" value={`${progress}%`} />
      <DetailInfoRow
        label="Độ ưu tiên"
        value={
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTaskPriorityBadgeClassName(priority)}`}
          >
            {getTaskPriorityLabel(priority)}
          </span>
        }
      />
      <DetailInfoRow label="Thời gian thực hiện" value={timelineLabel} />
      <DetailInfoRow
        label="Người tạo"
        value={creatorName}
        className="border-t border-slate-100 pt-3"
      />
      <DetailInfoRow label="Thời gian tạo" value={createdAtLabel} />
      <DetailInfoRow label="Cập nhật lần cuối" value={updatedAtLabel} />
    </DetailSidebar>
  );
}
