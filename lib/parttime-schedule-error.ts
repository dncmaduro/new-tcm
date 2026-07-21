export function mapParttimeScheduleError(error: unknown) {
  const message = error instanceof Error ? error.message : "Không thể thực hiện thao tác. Vui lòng thử lại.";
  const mappings: Array<[RegExp, string]> = [
    [/only part-time profiles can register shifts/i, "Chỉ nhân viên part-time mới được đăng ký ca."],
    [/registration closes at 07:00 monday/i, "Lịch đăng ký đã đóng từ 07:00 sáng thứ Hai."],
    [/schedule has already been finalized/i, "Lịch tuần này đã được chốt."],
    [/only unregister your own shift/i, "Bạn chỉ có thể hủy ca của chính mình."],
    [/request must be created before original work date/i, "Yêu cầu phải được tạo trước ngày làm việc cần thay đổi."],
    [/only a leader of this department can review request/i, "Chỉ Leader của phòng ban mới được duyệt yêu cầu này."],
    [/already exists|duplicate/i, "Ca này đã được đăng ký."],
    [/not found/i, "Không tìm thấy dữ liệu cần thao tác."],
    [/permission denied|not authorized/i, "Bạn không có quyền thực hiện thao tác này."],
  ];
  return mappings.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}
