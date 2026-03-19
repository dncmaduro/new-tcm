# Hệ thống quản lý nội bộ
## Hướng dẫn sử dụng

**Phiên bản tài liệu:** 1.0  
**Ngày cập nhật:** 19/03/2026

Tài liệu này hướng dẫn cách sử dụng toàn bộ hệ thống quản lý nội bộ dành cho nhân viên, trưởng nhóm, quản lý và người có quyền phân bổ mục tiêu/công việc. Nội dung được biên soạn dựa trên hành vi thực tế của ứng dụng đang triển khai, ưu tiên tính rõ ràng, dễ dùng và bám sát quy trình vận hành.

> [Ảnh minh họa: Trang tổng quan của hệ thống]

---

## Mục lục

- [1. Giới thiệu hệ thống](#1-gioi-thieu-he-thong)
- [2. Tổng quan giao diện](#2-tong-quan-giao-dien)
- [3. Hướng dẫn sử dụng theo module](#3-huong-dan-su-dung-theo-module)
  - [3.1 Dashboard](#31-dashboard)
  - [3.2 Mục tiêu](#32-muc-tieu)
  - [3.3 Chi tiết mục tiêu](#33-chi-tiet-muc-tieu)
  - [3.4 Key Result](#34-key-result)
  - [3.5 Công việc](#35-cong-viec)
  - [3.6 Timeline/Gantt](#36-timelinegantt)
  - [3.7 Hiệu suất phòng ban](#37-hieu-suat-phong-ban)
  - [3.8 Nhật ký hoạt động](#38-nhat-ky-hoat-dong)
  - [3.9 Chấm công](#39-cham-cong)
  - [3.10 Quản lý yêu cầu thời gian](#310-quan-ly-yeu-cau-thoi-gian)
  - [3.11 Phòng ban](#311-phong-ban)
  - [3.12 Báo cáo hiệu suất](#312-bao-cao-hieu-suat)
  - [3.13 Hồ sơ cá nhân](#313-ho-so-ca-nhan)
- [4. Hướng dẫn theo nghiệp vụ](#4-huong-dan-theo-nghiep-vu)
- [5. Quyền hạn và hiển thị theo vai trò](#5-quyen-han-va-hien-thi-theo-vai-tro)
- [6. Giải thích logic tính tiến độ và hiệu suất](#6-giai-thich-logic-tinh-tien-do-va-hieu-suat)
- [7. Các trạng thái và ý nghĩa](#7-cac-trang-thai-va-y-nghia)
- [8. Các lưu ý quan trọng khi sử dụng](#8-cac-luu-y-quan-trong-khi-su-dung)
- [9. Câu hỏi thường gặp (FAQ)](#9-cau-hoi-thuong-gap-faq)
- [10. Phụ lục thuật ngữ](#10-phu-luc-thuat-ngu)

---

## 1. Giới thiệu hệ thống

Hệ thống quản lý nội bộ được xây dựng để giúp doanh nghiệp theo dõi toàn bộ chuỗi thực thi từ mục tiêu chiến lược đến công việc hằng ngày:

- Theo dõi mục tiêu theo quý/năm.
- Phối hợp nhiều phòng ban cùng tham gia một mục tiêu.
- Giao Key Result cho đúng phòng ban chịu trách nhiệm.
- Phân bổ công việc xuống đúng Key Result để đo lường thực thi.
- Giám sát tiến độ, deadline, rủi ro, lịch sử thay đổi và hiệu suất phòng ban.
- Theo dõi chấm công và xử lý yêu cầu điều chỉnh thời gian làm việc.

### Đối tượng sử dụng

| Nhóm người dùng | Mục đích sử dụng chính |
| --- | --- |
| Nhân viên | Xem dashboard cá nhân, theo dõi task, cập nhật công việc, theo dõi chấm công, gửi/xem yêu cầu điều chỉnh công |
| Trưởng nhóm / quản lý | Theo dõi tiến độ team, giao mục tiêu/KR/task, xem deadline, rà soát hiệu suất phòng ban |
| Người có quyền phân bổ | Tạo mục tiêu, tạo KR, tạo task, xem trang Hiệu suất phòng ban |
| Người quản lý phòng ban | Đánh giá đóng góp của từng phòng ban trên goal, rà bottleneck, theo dõi thành viên |

### Khái niệm cốt lõi

| Thuật ngữ | Giải thích dễ hiểu |
| --- | --- |
| **Mục tiêu (Goal)** | Mục tiêu tổng thể cần đạt trong một giai đoạn. Một goal có thể có nhiều phòng ban cùng tham gia. |
| **Kết quả then chốt (Key Result / KR)** | Kết quả đo lường cụ thể để biết goal có đang tiến triển đúng hướng hay không. Mỗi KR thuộc một goal và do một phòng ban chịu trách nhiệm chính. |
| **Công việc (Task)** | Việc thực thi hằng ngày/tuần để đẩy KR đi lên. Task luôn nằm dưới KR, không gắn trực tiếp vào goal. |
| **Phòng ban tham gia** | Danh sách phòng ban cùng góp phần vào một goal. Mỗi phòng ban có vai trò và trọng số đánh giá riêng. |
| **Trọng số đánh giá** | Mỗi phòng ban trong một goal có thể được đánh giá theo hai phần: ảnh hưởng từ tiến độ goal chung và ảnh hưởng từ tiến độ KR mà phòng ban đó sở hữu. |
| **Tiến độ** | Mức độ hoàn thành hiện tại của goal, KR hoặc task. |
| **Hiệu suất phòng ban** | Điểm đánh giá thực thi của một phòng ban trong một goal, không hoàn toàn giống với tiến độ goal chung. |

> **Lưu ý:** Trong hệ thống này, chuỗi đúng là **Goal → Key Result → Task**. Nếu một goal chưa có KR, hệ thống sẽ chưa thể phản ánh đầy đủ tiến độ thực thi.

---

## 2. Tổng quan giao diện

Thanh điều hướng bên trái là khu vực truy cập nhanh tới các module chính:

| Mục menu | Chức năng |
| --- | --- |
| **Bảng điều khiển** | Trang tổng quan cá nhân và đội nhóm |
| **Mục tiêu** | Xem canvas mục tiêu, danh sách mục tiêu, mở drawer chi tiết nhanh |
| **Công việc** | Quản lý công việc theo danh sách hoặc Gantt timeline |
| **Chấm công** | Theo dõi nhật ký công, thống kê giờ làm, yêu cầu điều chỉnh công |
| **Quản lý yêu cầu thời gian** | Duyệt yêu cầu điều chỉnh công theo phạm vi vai trò |
| **Báo cáo** | Xem báo cáo hiệu suất theo phạm vi được cấp |
| **Hiệu suất phòng ban** | Màn hình quản trị dành cho người có quyền quản lý/phân bổ |
| **Phòng ban** | Xem cơ cấu phòng ban và thành viên |
| **Hồ sơ** | Quản lý thông tin cá nhân, ảnh đại diện, đổi mật khẩu |

### Một số nguyên tắc hiển thị quan trọng

- Nút tạo mục tiêu, KR, task chỉ xuất hiện khi người dùng có quyền quản lý tương ứng.
- Trang **Hiệu suất phòng ban** chỉ hiện trong menu khi người dùng có quyền quản lý.
- Dữ liệu luôn ưu tiên ngữ cảnh người dùng hiện tại: task của tôi, deadline liên quan tới tôi, chấm công hôm nay của tôi.

---

## 3. Hướng dẫn sử dụng theo module

### 3.1 Dashboard

**Mục đích**  
Cho người dùng cái nhìn nhanh về công việc, mục tiêu, chấm công, deadline và hoạt động gần đây.

**Ai dùng**  
Tất cả người dùng.

**Cách truy cập**  
Chọn **Bảng điều khiển** ở menu trái.

**Các thành phần chính**

- Thẻ tổng quan ở đầu trang.
- Biểu đồ xu hướng hoàn thành công việc 7 ngày.
- Widget theo dõi thời gian hôm nay.
- Danh sách **Công việc của tôi**.
- **Hạn sắp tới**.
- **Tiến độ mục tiêu**.
- **Hiệu suất nhóm**.
- **Hoạt động gần đây**.

**Thao tác thường dùng**

1. Xem nhanh số lượng công việc đang xử lý.
2. Mở danh sách task từ widget **Công việc của tôi**.
3. Mở module chấm công từ widget **Theo dõi thời gian**.
4. Theo dõi deadline gần nhất và hoạt động team gần đây.

**Ví dụ sử dụng thực tế**  
Buổi sáng, nhân viên vào Dashboard để kiểm tra hôm nay đang làm task nào, có deadline nào sắp tới, đã check-in chưa, và team vừa cập nhật gì.

> [Ảnh minh họa: Màn hình Dashboard]

> **Ghi chú:** Nếu dữ liệu của một block chưa đủ, hệ thống sẽ hiển thị trạng thái trống hoặc đang tải thay vì số liệu giả.

### 3.2 Mục tiêu

**Mục đích**  
Quản lý toàn bộ goal trong hệ thống theo góc nhìn tổng quan: canvas hoặc danh sách.

**Ai dùng**

- Tất cả người dùng có thể xem dữ liệu trong phạm vi được cấp.
- Người có quyền quản lý mới thấy nút **+ Thêm mục tiêu**.

**Cách truy cập**  
Chọn **Mục tiêu** ở menu trái.

**Các thành phần chính trên màn hình**

- Chế độ **Canvas** và **Danh sách**.
- Bộ điều khiển thu phóng canvas.
- Goal card với:
  - phòng ban chính / tóm tắt phòng ban tham gia,
  - trạng thái sức khỏe thực thi,
  - số lượng KR,
  - số lượng task,
  - tiến độ,
  - chủ sở hữu,
  - hạn chót.
- Drawer **Chi tiết mục tiêu** bên phải.
- Nút **Xem nhật ký kiểm tra** để xem lịch sử thay đổi.

**Thao tác thường dùng**

1. Dùng Canvas để rà nhanh cấu trúc mục tiêu.
2. Dùng Danh sách để xem dữ liệu gọn hơn theo dòng.
3. Bấm vào goal để mở drawer chi tiết nhanh.
4. Dùng **Mở trang chi tiết** để đi vào trang quản lý sâu hơn.
5. Dùng **Thêm KR** nhanh từ drawer hoặc **+ KR** trên card.

**Ví dụ sử dụng thực tế**  
Trưởng nhóm muốn rà tiến độ toàn bộ goal quý hiện tại: mở canvas để nhìn sức khỏe chung, sau đó mở drawer của goal chậm tiến độ để xem KR và task theo từng KR.

> [Ảnh minh họa: Màn hình Canvas mục tiêu]

> **Lưu ý:** Phần trăm ở khu vực điều khiển canvas là **mức thu phóng**, không phải tiến độ mục tiêu.

### 3.3 Chi tiết mục tiêu

**Mục đích**  
Là màn hình làm việc chính để quản lý một goal: cấu hình thông tin, theo dõi tiến độ, quản lý phòng ban tham gia, tạo KR và xem task dưới từng KR.

**Ai dùng**

- Người xem goal.
- Người có quyền quản lý mới có thể tạo KR hoặc tạo việc từ trang này.

**Cách truy cập**

- Từ Canvas/Danh sách mục tiêu, chọn **Mở trang chi tiết**.
- Hoặc mở trực tiếp từ liên kết chi tiết.

**Các thành phần chính**

- Khối thông tin goal: tên, mô tả, ghi chú, loại, quý/năm, ngày bắt đầu/kết thúc.
- Khối **Phòng ban tham gia & hiệu suất**:
  - vai trò của từng phòng ban,
  - `goal_weight`,
  - `kr_weight`,
  - tiến độ KR sở hữu,
  - hiệu suất phòng ban trên goal.
- Khu vực **Danh sách KR**.
- Khu vực **Task theo KR**.
- Khu vực **Mục tiêu con** nếu có.
- Cột bên phải với thông tin tóm tắt và hiệu suất thực thi.

**Thao tác thường dùng**

1. Kiểm tra danh sách phòng ban tham gia.
2. Xem phòng ban nào đang chịu trách nhiệm chính cho từng KR.
3. Tạo KR mới bằng nút **+ Thêm key result**.
4. Tạo task dưới đúng KR bằng nút **+ Thêm công việc**.
5. So sánh tiến độ goal với hiệu suất từng phòng ban để phát hiện độ lệch.

**Ví dụ sử dụng thực tế**  
Một goal có Marketing là owner, Sales là participant. Quản lý vào trang Chi tiết mục tiêu để xem Marketing đang sở hữu KR nào, Sales đang đóng góp KR nào, và hiệu suất từng bên đang cao hay thấp hơn goal chung.

> [Ảnh minh họa: Màn hình Chi tiết mục tiêu]

### 3.4 Key Result

**Mục đích**  
KR là tầng đo lường giữa goal và task. Trong hệ thống hiện tại, KR chủ yếu được tạo và quản lý trong trang **Chi tiết mục tiêu**.

**Ai dùng**

- Người xem goal có thể xem KR.
- Người có quyền quản lý mới có thể tạo KR.

**Thông tin chính của KR**

- Tên KR.
- Mô tả.
- `start_value`.
- `current`.
- `target`.
- `weight`.
- Đơn vị đo.
- Phòng ban phụ trách.
- Tiến độ KR.
- Danh sách task nằm dưới KR.

**Thao tác thường dùng**

1. Chọn đúng phòng ban phụ trách trước khi tạo KR.
2. Cập nhật giá trị chỉ số hiện tại khi cần theo dõi kết quả.
3. Tạo task ngay bên trong card KR để bảo đảm đúng cấu trúc.

**Ví dụ sử dụng thực tế**  
KR “Tăng doanh thu online” được gán cho phòng ban Marketing. Tất cả task thực thi như chạy chiến dịch, tối ưu landing page, phối hợp sales đều phải nằm dưới KR này.

> **Lưu ý:** Nếu goal đã có danh sách phòng ban tham gia, phòng ban phụ trách KR phải nằm trong danh sách đó.

### 3.5 Công việc

**Mục đích**  
Quản lý toàn bộ task theo cấu trúc thực thi thực tế.

**Ai dùng**  
Tất cả người dùng có thể xem các task trong phạm vi được cấp; người có quyền quản lý mới có thể tạo task.

**Cách truy cập**  
Chọn **Công việc** ở menu trái.

**Các thành phần chính**

- Bộ lọc theo trạng thái, goal, KR, assignee, từ khóa.
- Toggle chế độ **Gantt** và **Danh sách**.
- Nút **+ Thêm công việc**.
- Chế độ Danh sách với cột:
  - Công việc,
  - Kết quả then chốt,
  - Mục tiêu,
  - Người phụ trách,
  - Trạng thái,
  - Tiến độ,
  - Deadline,
  - Thao tác.

**Thao tác thường dùng**

1. Tìm task theo KR hoặc goal liên quan.
2. Cập nhật nhanh deadline hoặc tiến độ.
3. Mở task để chỉnh sửa chi tiết.
4. Chuyển sang Gantt để xem theo trục thời gian.

**Ví dụ sử dụng thực tế**  
Nhân viên lọc task của mình để rà những việc đang làm và việc sắp tới hạn; quản lý lọc theo KR để theo dõi mức độ bám execution.

> [Ảnh minh họa: Màn hình Công việc - Danh sách]

### 3.6 Timeline/Gantt

**Mục đích**  
Cho phép theo dõi tiến độ công việc theo thời gian, thay vì chỉ xem dạng bảng.

**Ai dùng**  
Tất cả người dùng có nhu cầu theo dõi execution theo thời gian.

**Cách truy cập**

1. Vào **Công việc**.
2. Chọn chế độ **Gantt**.

**Các thành phần chính**

- Nhóm dữ liệu theo cấu trúc:
  - Goal
  - Key Result
  - Task
- Trục thời gian theo **Ngày / Tuần / Tháng**.
- Nút **Hôm nay**, **Trước**, **Sau**.
- Thanh tiến độ của task trên timeline.
- Phần riêng cho **Công việc chưa có hạn chót** ở phía dưới.

**Thao tác thường dùng**

1. Dùng Gantt để xem task nào đang kéo dài quá lâu.
2. Kiểm tra deadline tuần này.
3. Xem task thuộc KR nào và KR đó nằm trong goal nào.
4. Rà phần **Công việc chưa có hạn chót** để xử lý các task còn thiếu kế hoạch thời gian.

**Ví dụ sử dụng thực tế**  
Quản lý dự án mở Gantt theo tuần để xem các task của từng KR có đang dồn deadline vào cùng một giai đoạn hay không.

> [Ảnh minh họa: Màn hình Timeline/Gantt công việc]

> **Lưu ý:** Trong Gantt, task có deadline mới được hiển thị trên trục chính. Task chưa có deadline được tách xuống phần phụ để dễ xử lý.

### 3.7 Hiệu suất phòng ban

**Mục đích**  
Giúp người quản lý theo dõi tiến độ thực thi ở cấp phòng ban: goal, KR, task, thành viên, rủi ro, deadline và hoạt động gần đây.

**Ai dùng**

- Chỉ người có quyền quản lý giống quyền tạo/phân bổ mục tiêu, KR hoặc task.

**Cách truy cập**

- Chọn **Hiệu suất phòng ban** ở menu trái.
- Nếu không có quyền, mục menu này sẽ không xuất hiện.

**Các thành phần chính**

- Bộ lọc:
  - phòng ban,
  - quý,
  - năm,
  - trạng thái goal,
  - thành viên,
  - chỉ quá hạn,
  - từ khóa.
- Chế độ xem:
  - **Tổng quan**,
  - **Mục tiêu / KR**,
  - **Thành viên**.
- Tóm tắt tiến độ phòng ban và sức khỏe thực thi.
- Bảng execution theo goal/KR.
- Thẻ hiệu suất thành viên.
- Khu vực rủi ro, deadline sắp tới, hoạt động gần đây.

**Thao tác thường dùng**

1. Chọn đúng phòng ban cần theo dõi.
2. Dùng bộ lọc quý/năm để bám kỳ đánh giá.
3. Mở chế độ **Mục tiêu / KR** để xem goal nào đang chậm.
4. Mở chế độ **Thành viên** để xem ai quá tải, ai có nhiều task quá hạn.
5. Rà **rủi ro** và **deadline sắp tới** để ưu tiên xử lý.

**Ví dụ sử dụng thực tế**  
Trưởng phòng chọn phòng ban của mình, lọc quý hiện tại, bật **Chỉ quá hạn** để xem bottleneck. Sau đó mở block thành viên để xác định người đang có nhiều task chậm nhất.

> [Ảnh minh họa: Màn hình Hiệu suất phòng ban]

### 3.8 Nhật ký hoạt động

**Mục đích**  
Theo dõi các thay đổi quan trọng liên quan đến goal, KR và task.

**Ai dùng**  
Người theo dõi tiến độ, trưởng nhóm, quản lý.

**Hiện đang xuất hiện ở đâu**

- Widget **Hoạt động gần đây** trên Dashboard.
- Drawer **Nhật ký kiểm tra mục tiêu** trong module Mục tiêu.
- Phần hoạt động gần đây trong trang **Hiệu suất phòng ban**.

**Nội dung thường gặp**

- Tạo mới mục tiêu/KR/task.
- Cập nhật tiến độ task.
- Cập nhật trạng thái goal.
- Điều chỉnh dữ liệu liên quan đến thực thi.

**Ví dụ sử dụng thực tế**  
Quản lý kiểm tra vì sao tiến độ goal tăng mạnh trong ngày hôm qua bằng cách mở nhật ký để xem ai đã cập nhật KR hoặc task nào.

> **Ghi chú:** Nhật ký là nguồn tra cứu thay đổi, không thay thế cho trao đổi nghiệp vụ giữa các bên.

### 3.9 Chấm công

**Mục đích**  
Giúp nhân viên theo dõi giờ làm, thiếu giờ, tăng ca, remote và các yêu cầu điều chỉnh công.

**Ai dùng**  
Tất cả người dùng.

**Cách truy cập**  
Chọn **Chấm công** ở menu trái.

**Các thành phần chính**

- Thẻ thống kê:
  - tổng tăng ca,
  - thiếu có phép,
  - thiếu không phép,
  - tổng remote.
- Nhật ký chấm công theo tháng.
- Bộ lọc màu:
  - đúng giờ,
  - trễ/sớm,
  - thiếu công.
- Danh sách **Yêu cầu điều chỉnh công**.
- **Form điều chỉnh công** theo ngày.

**Thao tác thường dùng**

1. Kiểm tra ngày nào bị thiếu giờ hoặc chấm công bất thường.
2. Mở form điều chỉnh công từ đúng ngày cần sửa.
3. Lọc các yêu cầu theo trạng thái: tất cả, chờ duyệt, đã duyệt, từ chối.

**Ví dụ sử dụng thực tế**  
Nhân viên quên check-out có thể mở ngày tương ứng trên lịch tháng, xem form hiện có hoặc tạo yêu cầu điều chỉnh phù hợp.

> [Ảnh minh họa: Màn hình Chấm công]

### 3.10 Quản lý yêu cầu thời gian

**Mục đích**  
Dùng để duyệt hoặc từ chối yêu cầu điều chỉnh thời gian làm việc trong phạm vi được giao.

**Ai dùng**

- Giám đốc.
- Trưởng nhóm/quản lý có phạm vi duyệt.
- Thành viên vẫn có thể vào trang, nhưng nếu không có phạm vi duyệt, hệ thống sẽ báo rõ.

**Cách truy cập**  
Chọn **Quản lý yêu cầu thời gian** ở menu trái.

**Các thành phần chính**

- Thẻ tổng hợp:
  - tổng yêu cầu,
  - chờ duyệt,
  - đã duyệt,
  - đã từ chối.
- Danh sách yêu cầu với thông tin:
  - nhân sự,
  - ngày cần sửa,
  - loại,
  - thời lượng,
  - lý do,
  - ngày gửi,
  - trạng thái,
  - bạn đã duyệt hay chưa.
- Nút **Duyệt** / **Từ chối**.

**Các loại yêu cầu hiện có**

- Thiếu thời gian có phép.
- Thiếu thời gian không phép.
- Tăng ca.
- Làm việc từ xa.

**Ví dụ sử dụng thực tế**  
Trưởng nhóm vào trang này mỗi ngày để xử lý đơn tăng ca và các trường hợp thiếu giờ có phép của thành viên trong phạm vi mình quản lý.

> [Ảnh minh họa: Màn hình Duyệt yêu cầu thời gian]

### 3.11 Phòng ban

**Mục đích**  
Xem cơ cấu tổ chức, quan hệ cha/con giữa các phòng ban và danh sách thành viên.

**Ai dùng**  
Tất cả người dùng có nhu cầu tra cứu cơ cấu tổ chức.

**Cách truy cập**  
Chọn **Phòng ban** ở menu trái.

**Các thành phần chính**

- Chế độ **Cây** và **Danh sách**.
- Ô tìm kiếm phòng ban.
- Panel chi tiết bên phải:
  - trưởng phòng,
  - số lượng thành viên,
  - số phòng ban con,
  - danh sách thành viên.

**Ví dụ sử dụng thực tế**  
Nhân viên mới dùng module này để xác định bộ máy tổ chức và các đầu mối quản lý theo từng phòng ban.

> [Ảnh minh họa: Màn hình Phòng ban]

### 3.12 Báo cáo hiệu suất

**Mục đích**  
Cho phép xem báo cáo hiệu suất theo phạm vi vai trò hiện tại.

**Ai dùng**

- Thành viên: xem dữ liệu trong phạm vi cá nhân.
- Trưởng nhóm: xem dữ liệu trong phạm vi team/phòng ban con thuộc quyền.
- Giám đốc: xem phạm vi rộng hơn.

**Cách truy cập**  
Chọn **Báo cáo** ở menu trái.

**Các thành phần chính**

- Thẻ xác nhận **vai trò hiện tại**.
- Danh sách báo cáo hiệu suất.
- Chỉ số như:
  - phần trăm hoàn thành,
  - số task,
  - thời điểm tạo/cập nhật báo cáo.

**Ví dụ sử dụng thực tế**  
Trưởng nhóm xem báo cáo hiệu suất định kỳ của nhân sự thuộc nhóm phụ trách để có thêm dữ liệu trước buổi đánh giá.

> **Ghi chú:** Màn hình này phản ánh dữ liệu báo cáo đã được ghi nhận trong hệ thống; phạm vi hiển thị thay đổi theo vai trò hiện tại.

### 3.13 Hồ sơ cá nhân

**Mục đích**  
Quản lý thông tin cá nhân và ảnh đại diện.

**Ai dùng**  
Tất cả người dùng.

**Cách truy cập**

1. Bấm ảnh đại diện ở cuối menu trái.
2. Chọn **Hồ sơ**.

**Các thành phần chính**

- Thông tin cá nhân: họ tên, email, số điện thoại.
- Ảnh đại diện.
- Thông tin tham gia: phòng ban, vai trò, ngày vào làm, ngày nghỉ.
- Nút **Chỉnh sửa**, **Lưu thay đổi**.
- Nút **Đổi mật khẩu**.
- Công cụ **Cắt ảnh đại diện** trước khi lưu.

**Ví dụ sử dụng thực tế**  
Người dùng cập nhật số điện thoại, chỉnh avatar và đổi mật khẩu trong cùng một khu vực hồ sơ cá nhân.

> [Ảnh minh họa: Màn hình Hồ sơ cá nhân]

---

## 4. Hướng dẫn theo nghiệp vụ

### 4.1 Tạo một mục tiêu mới

**Dành cho:** Người có quyền tạo mục tiêu.

1. Vào **Mục tiêu**.
2. Bấm **+ Thêm mục tiêu**.
3. Nhập tên, mô tả, loại mục tiêu, quý/năm, ngày bắt đầu/kết thúc.
4. Chọn phòng ban chính.
5. Chọn goal cha nếu cần.
6. Kiểm tra lại các phòng ban tham gia trước khi lưu.
7. Bấm lưu để tạo goal.

> **Mẹo:** Nên khai báo ngày bắt đầu/kết thúc ngay từ đầu để các màn hình tiến độ, timeline và deadline phản ánh chính xác hơn.

### 4.2 Gán nhiều phòng ban tham gia vào cùng một mục tiêu

1. Trong form tạo goal, chọn phòng ban chính.
2. Thêm các phòng ban tham gia.
3. Với mỗi phòng ban, cấu hình:
   - vai trò,
   - `goal_weight`,
   - `kr_weight`.
4. Đảm bảo hai trọng số này hợp lệ cho từng dòng.
5. Lưu goal.

> **Khuyến nghị:** Nếu phòng ban chủ yếu bị đánh giá theo kết quả goal chung, tăng `goal_weight`. Nếu phòng ban chủ yếu bị đánh giá theo KR mình sở hữu, tăng `kr_weight`.

### 4.3 Tạo KR cho đúng phòng ban chịu trách nhiệm

1. Mở **Chi tiết mục tiêu**.
2. Trong khu vực **Danh sách KR**, bấm **+ Thêm key result**.
3. Nhập tên, mô tả, giá trị đầu, giá trị hiện tại, mục tiêu, trọng số.
4. Chọn **phòng ban phụ trách**.
5. Lưu KR.

> **Lưu ý:** Phòng ban phụ trách KR nên là một trong các phòng ban đã tham gia goal.

### 4.4 Tạo task dưới KR

1. Vào **Chi tiết mục tiêu** hoặc **Công việc**.
2. Chọn goal, sau đó chọn KR.
3. Bấm **+ Thêm công việc**.
4. Chọn người phụ trách, loại task, trạng thái, trọng số, deadline.
5. Lưu task.

> **Quan trọng:** Hệ thống không thiết kế task gắn trực tiếp vào goal. Muốn tạo task, goal cần có ít nhất một KR.

### 4.5 Theo dõi tiến độ mục tiêu

1. Vào **Mục tiêu** để rà nhanh trên canvas.
2. Mở drawer **Chi tiết mục tiêu** để xem tóm tắt.
3. Nếu cần phân tích sâu, bấm **Mở trang chi tiết**.
4. So sánh:
   - tiến độ goal,
   - tiến độ từng KR,
   - task bên dưới mỗi KR.

### 4.6 Theo dõi tiến độ công việc trên timeline

1. Vào **Công việc**.
2. Chọn chế độ **Gantt**.
3. Dùng bộ điều khiển **Ngày / Tuần / Tháng**.
4. Kiểm tra các task có deadline gần hoặc quá hạn.
5. Mở phần **Công việc chưa có hạn chót** để rà dữ liệu thiếu kế hoạch.

### 4.7 Xem hiệu suất phòng ban

1. Vào **Hiệu suất phòng ban**.
2. Chọn phòng ban cần theo dõi.
3. Chọn quý, năm hoặc trạng thái goal phù hợp.
4. Xem tóm tắt:
   - tiến độ phòng ban,
   - sức khỏe thực thi,
   - số goal/KR/task liên quan.
5. Chuyển sang chế độ **Mục tiêu / KR** hoặc **Thành viên** để đào sâu.

### 4.8 Xem mức đóng góp của từng phòng ban trong một goal

1. Mở **Chi tiết mục tiêu**.
2. Tìm khối **Phòng ban tham gia & hiệu suất**.
3. Kiểm tra từng phòng ban:
   - vai trò,
   - `goal_weight`,
   - `kr_weight`,
   - tiến độ KR sở hữu,
   - hiệu suất tính toán cuối cùng.

### 4.9 Kiểm tra deadline sắp tới

1. Vào **Dashboard** để xem block **Hạn sắp tới**.
2. Hoặc vào **Công việc** để lọc theo deadline.
3. Trong Gantt, ưu tiên rà:
   - task quá hạn,
   - task đến hạn 7 ngày,
   - task chưa có deadline.

### 4.10 Xem nhật ký thay đổi

1. Vào **Mục tiêu**.
2. Mở drawer goal.
3. Chọn **Xem nhật ký kiểm tra**.
4. Đọc các thay đổi theo thời gian để hiểu ai đã cập nhật gì.

---

## 5. Quyền hạn và hiển thị theo vai trò

Hệ thống hiện dùng cơ chế quyền thống nhất cho các thao tác quản lý goal/KR/task và trang hiệu suất phòng ban.

### 5.1 Người dùng thông thường

- Có thể xem dashboard cá nhân.
- Có thể xem task, mục tiêu, chấm công, hồ sơ, phòng ban, báo cáo theo phạm vi cho phép.
- Không thấy nút tạo goal/KR/task nếu không có quyền quản lý.

### 5.2 Người có quyền quản lý

Trong giao diện hiện tại, đây là nhóm người dùng có quyền tương đương với:

- tạo mục tiêu,
- tạo KR,
- tạo task,
- truy cập trang **Hiệu suất phòng ban**.

Các quyền này được hiển thị theo cùng một nguồn quyền trong hệ thống, nên:

- nếu không có quyền, menu **Hiệu suất phòng ban** sẽ bị ẩn;
- nếu mở trực tiếp URL, trang sẽ báo không có quyền truy cập;
- các nút **+ Thêm mục tiêu**, **+ Thêm key result**, **+ Thêm công việc** sẽ không xuất hiện hoặc không cho thao tác.

### 5.3 Phạm vi vai trò trong Báo cáo và Duyệt yêu cầu thời gian

| Vai trò trong giao diện | Phạm vi hiển thị chính |
| --- | --- |
| **Thành viên** | Chủ yếu dữ liệu của chính mình |
| **Trưởng nhóm** | Dữ liệu của phạm vi team/phòng ban thuộc quyền |
| **Giám đốc** | Phạm vi rộng hơn theo dữ liệu hệ thống |

> **Lưu ý:** Một số màn hình như **Quản lý yêu cầu thời gian** vẫn có thể mở được bởi người dùng không có phạm vi duyệt, nhưng hệ thống sẽ báo rõ rằng người dùng chưa có phạm vi xử lý yêu cầu cấp dưới.

---

## 6. Giải thích logic tính tiến độ và hiệu suất

Phần này được viết theo cách dễ hiểu để người dùng không chuyên kỹ thuật vẫn có thể đọc và áp dụng.

### 6.1 Tiến độ Task

Task có hai cách tính tiến độ tùy loại:

| Loại task | Cách tính |
| --- | --- |
| **KPI** | Dùng trực tiếp phần trăm progress do người phụ trách cập nhật |
| **OKR** | Tự suy ra theo trạng thái: Cần làm 0%, Đang làm 50%, Hoàn thành 100%, Đã hủy 0% |

### 6.2 Tiến độ KR

Ưu tiên chính:

- Tiến độ KR được tính từ các task nằm dưới KR.
- Nếu KR có nhiều task, hệ thống dùng trung bình có trọng số của task.

Trong một số trường hợp KR chưa có task nhưng đã có số liệu chỉ số:

- Hệ thống có thể dùng tỷ lệ giữa `start_value`, `current` và `target` để phản ánh tiến triển đo lường.

Hiểu đơn giản:

- KR là tầng “đo kết quả”.
- Task là tầng “làm việc”.
- Nếu task đã phản ánh đủ execution, tiến độ KR sẽ bám theo task.
- Nếu chưa có task nhưng đã có số liệu chỉ tiêu, hệ thống vẫn có thể hiển thị mức tiến triển của chỉ số.

### 6.3 Tiến độ Goal

- Tiến độ goal được tính từ các KR thuộc goal đó.
- Cách hiển thị hiện tại là lấy trung bình tiến độ của các KR.

Điều này có nghĩa:

- Goal không có KR thì chưa có cơ sở tốt để theo dõi tiến độ.
- Khi goal chưa có KR, màn hình sẽ ưu tiên nhắc người dùng thêm KR trước.

### 6.4 Hiệu suất phòng ban

Hiệu suất của một phòng ban trên cùng một goal **không nhất thiết giống** tiến độ goal chung.

Hệ thống đang dùng cách hiểu như sau:

**Hiệu suất phòng ban = Ảnh hưởng từ goal chung + Ảnh hưởng từ KR mà phòng ban sở hữu**

Nói dễ hiểu:

- Nếu phòng ban được đánh giá nhiều theo kết quả goal chung, `goal_weight` sẽ quan trọng hơn.
- Nếu phòng ban được đánh giá nhiều theo các KR do mình trực tiếp chịu trách nhiệm, `kr_weight` sẽ quan trọng hơn.

### 6.5 Vì sao tiến độ goal và hiệu suất phòng ban có thể khác nhau?

Ví dụ:

- Goal đang đạt 70%.
- Nhưng phòng ban A sở hữu các KR đang chậm, nên hiệu suất của A có thể thấp hơn 70%.
- Ngược lại, phòng ban B sở hữu các KR mạnh hơn, hiệu suất của B có thể cao hơn goal chung.

Đây là điểm rất quan trọng khi đánh giá phối hợp liên phòng ban.

> **Kết luận ngắn:**  
> **Tiến độ goal** trả lời câu hỏi “mục tiêu chung đang đi đến đâu?”.  
> **Hiệu suất phòng ban** trả lời câu hỏi “phòng ban đó đang đóng góp tốt đến mức nào trong goal này?”.

---

## 7. Các trạng thái và ý nghĩa

### 7.1 Trạng thái mục tiêu

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Nháp** | Mục tiêu đang được chuẩn bị, chưa vào nhịp thực thi chính |
| **Đang hoạt động** | Mục tiêu đang được triển khai |
| **Hoàn thành** | Mục tiêu đã đạt yêu cầu |
| **Đã hủy** | Mục tiêu không tiếp tục theo dõi |

### 7.2 Trạng thái sức khỏe thực thi

| Nhãn hiển thị | Ý nghĩa |
| --- | --- |
| **Đúng tiến độ** | Tình hình đang ổn, bám đúng kỳ vọng |
| **Có rủi ro** | Có dấu hiệu cần theo dõi sát |
| **Chậm tiến độ** | Đang trễ so với kỳ vọng hoặc có bottleneck rõ |

### 7.3 Trạng thái công việc

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Cần làm** | Chưa bắt đầu |
| **Đang làm** | Đang triển khai |
| **Hoàn thành** | Đã xong |
| **Đã hủy** | Không tiếp tục thực hiện |

### 7.4 Trạng thái yêu cầu điều chỉnh công

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Chờ duyệt** | Đang chờ người có thẩm quyền xử lý |
| **Đã duyệt** | Yêu cầu được chấp nhận |
| **Từ chối** | Yêu cầu không được chấp nhận |

### 7.5 Trạng thái chấm công theo ngày

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Đúng giờ** | Chấm công hợp lệ, không thiếu giờ đáng kể |
| **Trễ/Sớm** | Có đi muộn, về sớm hoặc lệch khung làm việc |
| **Thiếu công** | Thiếu giờ làm hoặc dữ liệu chấm công không đủ |

### 7.6 Hạn chót

| Tình trạng | Ý nghĩa |
| --- | --- |
| **Quá hạn** | Deadline đã qua nhưng task chưa hoàn thành |
| **Đến hạn hôm nay** | Cần ưu tiên xử lý ngay |
| **Đến hạn trong 7 ngày** | Nên theo dõi sát để tránh dồn việc |
| **Chưa có hạn chót** | Task chưa có mốc thời gian, cần bổ sung kế hoạch |

---

## 8. Các lưu ý quan trọng khi sử dụng

- Task phải nằm dưới KR. Nếu goal chưa có KR, bạn chưa thể tạo task đúng cấu trúc mới.
- Một goal có thể có nhiều phòng ban tham gia; không nên hiểu goal chỉ thuộc duy nhất một team.
- Mỗi KR có một phòng ban chịu trách nhiệm chính.
- Hiệu suất phòng ban không đồng nghĩa với tiến độ goal chung.
- Nếu goal chưa có KR, một số màn hình sẽ không hiển thị progress bar mà thay bằng lời nhắc thêm KR.
- Nếu task chưa có deadline, task đó sẽ không nằm trong trục thời gian chính của Gantt.
- Nếu dữ liệu nested còn thiếu, màn hình có thể hiển thị các trạng thái như **Chưa có**, **Chưa gán**, hoặc ô trống có giải thích.
- Các nút tạo/sửa liên quan đến quản lý phụ thuộc vào quyền hiện tại của người dùng.

> **Khuyến nghị vận hành:**  
> Tạo goal xong nên tạo KR ngay, rồi mới phân task. Nếu làm ngược, việc theo dõi tiến độ và đánh giá đóng góp phòng ban sẽ kém chính xác.

---

## 9. Câu hỏi thường gặp (FAQ)

### 9.1 Vì sao tôi không thấy nút “+ Thêm mục tiêu”?

Bạn chưa có quyền quản lý tương ứng trong hệ thống. Quyền này cũng là nguồn quyết định việc bạn có được tạo KR, tạo task và truy cập trang Hiệu suất phòng ban hay không.

### 9.2 Vì sao goal của tôi chưa có tiến độ?

Thông thường goal cần có ít nhất một KR để hệ thống có cơ sở tính tiến độ. Nếu chưa có KR, giao diện sẽ nhắc bạn thêm KR trước.

### 9.3 Tôi có thể tạo task trực tiếp dưới goal không?

Không. Task phải được tạo dưới một KR.

### 9.4 Vì sao một goal có nhiều phòng ban?

Vì nhiều mục tiêu cần phối hợp liên phòng ban. Hệ thống cho phép khai báo vai trò và trọng số đánh giá riêng cho từng phòng ban tham gia.

### 9.5 Vì sao phòng ban của tôi có hiệu suất thấp hơn tiến độ goal chung?

Vì hiệu suất phòng ban được tính từ cả tiến độ goal chung và tiến độ các KR mà phòng ban sở hữu. Nếu các KR của phòng ban đang chậm, hiệu suất có thể thấp hơn goal chung.

### 9.6 Vì sao task không xuất hiện trên Gantt?

Nguyên nhân phổ biến:

- task chưa có deadline,
- task không nằm trong bộ lọc hiện tại,
- task thuộc phần **Công việc chưa có hạn chót** phía dưới.

### 9.7 Tôi có thể xem lịch sử thay đổi ở đâu?

Bạn có thể xem trong:

- widget **Hoạt động gần đây** ở Dashboard,
- drawer **Nhật ký kiểm tra mục tiêu** trong module Mục tiêu,
- phần hoạt động gần đây của trang **Hiệu suất phòng ban**.

### 9.8 Tôi vào trang Quản lý yêu cầu thời gian nhưng không duyệt được?

Khả năng cao bạn không có phạm vi duyệt cấp dưới. Hệ thống vẫn cho mở trang nhưng sẽ thông báo rõ khi bạn không có quyền xử lý.

### 9.9 Tôi nên dùng Danh sách hay Gantt ở trang Công việc?

- Dùng **Danh sách** khi cần lọc, rà dữ liệu chi tiết theo từng cột.
- Dùng **Gantt** khi cần xem tiến độ theo thời gian, deadline và mức độ dồn việc.

### 9.10 Goal detail và Goal canvas khác nhau thế nào?

- **Goal canvas** phù hợp để rà nhanh nhiều goal và mở drawer chi tiết ngắn.
- **Goal detail** phù hợp để làm việc sâu: quản lý KR, task, phòng ban tham gia và hiệu suất.

---

## 10. Phụ lục thuật ngữ

| Thuật ngữ | Nghĩa ngắn gọn |
| --- | --- |
| **Goal** | Mục tiêu tổng thể |
| **Key Result (KR)** | Kết quả then chốt để đo goal |
| **Task** | Công việc thực thi dưới KR |
| **Owner department** | Phòng ban chính hoặc chịu trách nhiệm chính |
| **Participant / Supporter** | Phòng ban tham gia / hỗ trợ trong cùng goal |
| **goal_weight** | Mức ảnh hưởng của goal chung tới đánh giá phòng ban |
| **kr_weight** | Mức ảnh hưởng của KR do phòng ban sở hữu tới đánh giá phòng ban |
| **Responsible department** | Phòng ban phụ trách một KR |
| **Deadline** | Hạn chót của công việc |
| **Execution health** | Sức khỏe thực thi hiện tại |
| **Activity log** | Nhật ký thay đổi gần đây |

---

## Kết luận

Hệ thống được thiết kế để giúp doanh nghiệp quản lý thực thi theo một chuỗi rõ ràng:

**Mục tiêu → Kết quả then chốt → Công việc**

Khi sử dụng đúng cấu trúc này, người dùng sẽ:

- dễ theo dõi tiến độ hơn,
- dễ xác định trách nhiệm hơn,
- dễ đánh giá đóng góp của từng phòng ban hơn,
- và giảm đáng kể tình trạng “goal có nhưng không đo được execution”.

> [Ảnh minh họa: Tổng hợp các màn hình chính của hệ thống]

Nếu tài liệu này được dùng làm cẩm nang onboarding, nên bổ sung ảnh chụp thực tế cho từng module quan trọng để người dùng mới làm quen nhanh hơn.
