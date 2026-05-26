# Hướng dẫn ngắn về Chấm công và các form chấm công

## 1. Quản lý những gì

Phần `Chấm công` trong hệ thống dùng để quản lý 2 nhóm nội dung chính:

- Kết quả đi làm hằng ngày của mỗi người
  - Giờ vào
  - Giờ ra
  - Số giờ bị thiếu
  - Ngày vắng mặt
  - Tăng ca
- Các form liên quan đến thời gian làm việc
  - Nghỉ có phép
  - Nghỉ không phép
  - Tăng ca
  - Làm việc từ xa

Với nhân viên:

- Dùng để xem công của bản thân
- Gửi form khi cần điều chỉnh hoặc giải trình
- Theo dõi form đã gửi

Với quản lý:

- Xem công của nhân sự trong phạm vi phụ trách
- Duyệt hoặc từ chối các form thời gian

## 2. Một số cơ chế cần lưu ý

- Hệ thống chỉ điều chỉnh kết quả chấm công khi form đã được duyệt.
- Nếu form đang chờ duyệt hoặc bị từ chối, kết quả chấm công sẽ chưa thay đổi.
- Nếu một ngày không đủ dữ liệu chấm công, hệ thống có thể ghi nhận là thiếu công.
- Chủ nhật và ngày nghỉ không bị tính giống ngày làm việc bình thường.
- Nghỉ có phép chỉ gửi được khi còn đủ quỹ phép.
- Form làm việc từ xa sẽ dựa vào giờ bắt đầu và giờ kết thúc bạn nhập.
- Tăng ca được khai báo theo số phút thực tế phát sinh.

## 3. Các chức năng như nào

### Chấm công

Dùng để:

- Xem lịch công theo tháng
- Kiểm tra ngày nào đủ công, ngày nào thiếu công
- Xem giờ vào và giờ ra từng ngày
- Xem nhanh các chỉ số như thiếu giờ, nghỉ phép, tăng ca, ngày vắng

### Yêu cầu thời gian

Dùng để:

- Xem danh sách các form đã gửi
- Theo dõi trạng thái `chờ duyệt`, `đã duyệt`, `từ chối`
- Mở lại chi tiết form đã tạo

### Tạo yêu cầu

Dùng khi cần tạo form mới.

Các loại form hiện có:

- Nghỉ có phép
- Nghỉ không phép
- Tăng ca
- Làm việc từ xa

Thông tin thường phải nhập:

- Loại yêu cầu
- Ngày cần điều chỉnh
- Lý do

Tùy loại form, hệ thống có thể yêu cầu thêm:

- Số giờ về sớm
- Số phút tăng ca
- Giờ bắt đầu và giờ kết thúc làm việc từ xa

### Quản lý chấm công

Dành cho quản lý để:

- Xem công của từng nhân sự
- Tìm kiếm nhân sự theo tên hoặc bộ phận
- Kiểm tra thống kê công của người đang xem

### Duyệt yêu cầu thời gian

Dành cho quản lý để:

- Xem các form cấp dưới đã gửi
- Lọc theo người gửi, loại form, trạng thái
- Duyệt hoặc từ chối form

## 4. Một số lưu ý

- Nên kiểm tra chấm công thường xuyên, không đợi đến cuối tháng mới rà.
- Khi thấy thiếu công, nên tạo form sớm để quản lý dễ xử lý.
- Lý do trong form nên viết ngắn gọn nhưng rõ ràng.
- Nghỉ có phép cần kiểm tra quỹ phép còn lại.
- Nếu làm việc từ xa, cần nhập đúng giờ bắt đầu và giờ kết thúc.
- Nếu không chắc nên dùng loại form nào, nên hỏi quản lý trước khi gửi.
- Quản lý nên xem kỹ ngày cần điều chỉnh, loại yêu cầu và lý do trước khi duyệt.
