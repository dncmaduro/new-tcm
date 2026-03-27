# Hướng dẫn sử dụng hệ thống TCM

Tài liệu này là cẩm nang sử dụng dành cho người dùng cuối của hệ thống TCM / newtcm. Nội dung tập trung vào cách hiểu và cách dùng các màn hình đang có trong hệ thống để phục vụ công việc hằng ngày, theo dõi mục tiêu, quản lý công việc, chấm công và giám sát hiệu suất.

---

## 1. Mục đích của tài liệu

Tài liệu này được xây dựng để:

- Giúp người dùng hiểu rõ hệ thống TCM dùng để làm gì.
- Giải thích từng trang đang có trong sản phẩm theo cách dễ hiểu, thực tế và dễ áp dụng.
- Hỗ trợ nhân viên, trưởng nhóm, quản lý và người điều phối công việc sử dụng hệ thống thống nhất.
- Giảm nhầm lẫn giữa các khái niệm như Goal, KR, Task, tiến độ, hiệu suất và chấm công.

**Ai nên đọc tài liệu này**

- Nhân viên đang theo dõi mục tiêu, công việc và chấm công trên hệ thống.
- Trưởng nhóm cần theo dõi tiến độ đội ngũ và duyệt các yêu cầu liên quan.
- Quản lý cần xem hiệu suất, báo cáo và tình hình thực thi theo phòng ban.
- Người mới sử dụng hệ thống và cần một tài liệu tổng quan để bắt đầu đúng cách.

**Sau khi đọc xong, người dùng có thể**

- Biết nên bắt đầu từ trang nào trong từng tình huống.
- Hiểu rõ mục đích của từng module.
- Sử dụng đúng các trang Mục tiêu, Công việc, Chấm công, Báo cáo và Quản lý.
- Hạn chế các lỗi thường gặp khi cập nhật dữ liệu hằng ngày.

---

## 2. Tổng quan hệ thống

TCM là hệ thống quản lý thực thi nội bộ, giúp doanh nghiệp theo dõi công việc từ mức định hướng đến mức thực hiện hằng ngày.

Hệ thống được tổ chức theo hai lớp lớn:

- **Lớp thực thi công việc**: theo dõi Goal, KR, Task, tiến độ và mốc thời gian.
- **Lớp quản trị vận hành**: theo dõi chấm công, yêu cầu thời gian, báo cáo, phòng ban và hiệu suất phòng ban.

### Các module chính trong hệ thống

| Module | Mục đích chính |
| --- | --- |
| **Bảng điều khiển** | Xem nhanh tình hình công việc, mục tiêu, thời gian và hoạt động gần đây |
| **Mục tiêu** | Theo dõi Goal, KR, cấu trúc mục tiêu và mức độ tiến triển |
| **Công việc** | Quản lý Task theo danh sách hoặc theo timeline/Gantt |
| **Chấm công** | Xem lịch công cá nhân, thống kê giờ làm và gửi yêu cầu điều chỉnh công |
| **Báo cáo** | Xem báo cáo hiệu suất trong phạm vi đang được hiển thị |
| **Hiệu suất phòng ban** | Theo dõi tiến độ và chất lượng thực thi ở cấp phòng ban |
| **Phòng ban** | Xem cơ cấu tổ chức, thành viên, trưởng phòng và quan hệ giữa các đơn vị |
| **Quản lý** | Duyệt yêu cầu thời gian và theo dõi chấm công của nhân sự trong phạm vi quản lý |
| **Hồ sơ cá nhân** | Cập nhật thông tin cá nhân, ảnh đại diện và mật khẩu |

### Logic cốt lõi của hệ thống

Trong phần quản lý thực thi, hệ thống vận hành theo chuỗi:

**Goal -> KR -> Task**

- **Goal** là cái đích cần đạt.
- **KR** là kết quả hoặc chỉ số đo lường mức độ tiến tới Goal.
- **Task** là việc cụ thể cần làm để kéo KR đi lên.

Điều quan trọng cần nhớ:

- Hoàn thành nhiều Task chưa chắc đã đạt KR.
- KR tăng tốt sẽ giúp Goal tiến lên rõ hơn.
- Goal nên nói về kết quả mong muốn, không phải danh sách việc phải làm.

---

## 3. Đối tượng sử dụng

Hệ thống phục vụ nhiều nhóm người dùng khác nhau. Tùy vai trò trên tài khoản, một số trang hoặc thao tác có thể hiển thị khác nhau.

### Nhân viên

Thường sử dụng để:

- Xem tổng quan công việc trong Bảng điều khiển.
- Theo dõi mục tiêu và công việc được giao.
- Cập nhật tiến độ công việc.
- Xem chấm công của bản thân.
- Gửi yêu cầu điều chỉnh công hoặc thời gian làm việc.
- Cập nhật hồ sơ cá nhân.

### Trưởng nhóm / Leader

Thường sử dụng để:

- Theo dõi công việc và tiến độ của nhóm.
- Xem mục tiêu, KR, Task theo phạm vi phụ trách.
- Rà hạn sắp tới, công việc quá hạn, hoạt động gần đây.
- Xem chấm công của nhân sự trong phạm vi được quản lý.
- Duyệt yêu cầu thời gian của cấp dưới khi có phạm vi phù hợp.

### Quản lý / Người điều phối

Thường sử dụng để:

- Theo dõi mục tiêu ở mức phòng ban hoặc toàn bộ phạm vi đang được giao.
- Tạo hoặc điều chỉnh Goal, KR, Task khi tài khoản có hỗ trợ.
- Xem báo cáo hiệu suất và hiệu suất phòng ban.
- Theo dõi rủi ro thực thi, hạn hoàn thành và hiệu suất thành viên.
- Quản lý chấm công và duyệt yêu cầu thời gian.

> Hệ thống hiển thị theo phạm vi thực tế của tài khoản. Vì vậy, cùng một trang nhưng dữ liệu của mỗi người có thể khác nhau.

---

## 4. Sơ đồ sử dụng tổng quát

Một luồng sử dụng điển hình trong ngày thường diễn ra như sau:

1. **Bắt đầu từ Bảng điều khiển** để nắm nhanh tình hình chung: công việc của tôi, hạn sắp tới, tiến độ mục tiêu, hoạt động gần đây.
2. **Mở Mục tiêu** khi cần xem bức tranh lớn: team đang hướng tới điều gì, KR nào đang kéo mục tiêu đi lên và mục tiêu nào đang có rủi ro.
3. **Mở Công việc** khi cần đi vào thực thi chi tiết: lọc task theo người phụ trách, mục tiêu, KR hoặc xem timeline theo thời gian.
4. **Vào Chấm công** để kiểm tra lịch công tháng hiện tại, số giờ thiếu, tăng ca hoặc gửi yêu cầu điều chỉnh công.
5. **Vào Báo cáo** khi cần xem tổng hợp hiệu suất trong phạm vi hiện tại.
6. **Vào Hiệu suất phòng ban** khi cần đánh giá sâu theo phòng ban: tiến độ, rủi ro, hạn hoàn thành, thành viên và đóng góp trên từng mục tiêu.
7. **Vào Phòng ban** khi cần xem sơ đồ tổ chức, người phụ trách đơn vị hoặc danh sách thành viên.
8. **Dùng các trang Quản lý** khi cần xem chấm công nhân sự hoặc duyệt yêu cầu thời gian.
9. **Cập nhật Hồ sơ cá nhân** khi cần đổi thông tin cá nhân, ảnh đại diện hoặc mật khẩu.

### Cách hiểu ngắn gọn

| Nhu cầu | Nên vào trang nào |
| --- | --- |
| Muốn xem nhanh toàn cảnh trong ngày | **Bảng điều khiển** |
| Muốn biết team đang chạy theo mục tiêu nào | **Mục tiêu** |
| Muốn xem việc cụ thể đang làm và mốc thời gian | **Công việc** |
| Muốn xem giờ công và gửi yêu cầu điều chỉnh | **Chấm công** |
| Muốn xem tổng hợp hiệu suất | **Báo cáo** |
| Muốn đánh giá hiệu quả thực thi của phòng ban | **Hiệu suất phòng ban** |
| Muốn xem cơ cấu tổ chức và nhân sự | **Phòng ban** |

---

## 5. Hướng dẫn chi tiết theo từng trang

## 5.1 Bảng điều khiển

### Mục đích của trang

Bảng điều khiển là nơi người dùng xem nhanh bức tranh tổng quan trước khi đi vào từng module chi tiết.

### Các thông tin chính hiển thị

Trang này hiện có các khối chính:

- Các chỉ số nhanh ở đầu trang.
- **Xu hướng hoàn thành công việc**.
- **Theo dõi thời gian**.
- **Công việc của tôi**.
- **Hạn sắp tới**.
- **Tiến độ mục tiêu**.
- **Hiệu suất nhóm**.
- **Hoạt động gần đây**.

### Người dùng thường làm gì tại đây

- Mở hệ thống vào đầu ngày để biết việc nào đang cần ưu tiên.
- Kiểm tra các công việc liên quan trực tiếp đến mình.
- Xem hạn sắp tới để tránh trễ mốc.
- Theo dõi tiến độ mục tiêu và hoạt động gần đây của nhóm.
- Từ Bảng điều khiển đi tiếp sang Mục tiêu, Công việc hoặc Chấm công khi cần chi tiết hơn.

### Khi nào nên dùng trang này

- Khi bắt đầu ngày làm việc.
- Khi cần nhìn nhanh tình hình chung mà chưa muốn mở từng module.
- Khi cần kiểm tra nhanh trạng thái công việc, tiến độ và thời gian trong một màn hình.

### Lưu ý khi sử dụng

- Bảng điều khiển phù hợp để xem tổng quan, không thay thế cho trang quản lý chi tiết.
- Nếu cần chỉnh sửa hoặc phân tích sâu, nên đi tiếp sang Mục tiêu, Công việc hoặc Chấm công.
- Dữ liệu trên các khối phản ánh theo phạm vi tài khoản hiện tại.

---

## 5.2 Mục tiêu

Trang Mục tiêu là trung tâm theo dõi Goal, KR và mối liên hệ với Task.

### Goal, KR và Task trong hệ thống

| Khái niệm | Ý nghĩa |
| --- | --- |
| **Goal** | Cái đích cần đạt trong một giai đoạn |
| **KR** | Kết quả đo lường mức độ tiến tới Goal |
| **Task** | Việc cụ thể cần làm để kéo KR đi lên |

### A. Trang tổng quan Mục tiêu

#### Mục đích của trang

Cho phép xem toàn bộ mục tiêu đang có dưới dạng trực quan hoặc danh sách.

#### Các thông tin chính hiển thị

Trang này hiện có:

- Chế độ **Canvas** và **Danh sách**.
- Tìm kiếm theo tên hoặc mô tả.
- Bộ lọc theo phòng ban, loại, trạng thái, quý và năm.
- Nút xóa bộ lọc.
- Card mục tiêu hiển thị tên mục tiêu, tiến độ, số KR, số Task, trạng thái, sức khỏe thực thi, khung thời gian, phòng ban chính và team tham gia.
- Panel **Chi tiết mục tiêu** mở nhanh từ danh sách/canvas.
- Nhật ký kiểm tra mục tiêu.

#### Người dùng thường làm gì tại đây

- Rà mục tiêu theo quý hoặc theo phòng ban.
- Mở panel chi tiết để đọc nhanh tình trạng thực thi.
- Xem mục tiêu nào đang chậm hoặc có rủi ro.
- Chuyển sang trang chi tiết mục tiêu khi cần quản lý sâu hơn.

#### Khi nào nên dùng trang này

- Khi cần xem bức tranh lớn của nhiều mục tiêu cùng lúc.
- Khi cần rà nhanh mục tiêu nào đang tốt, mục tiêu nào cần chú ý.
- Khi cần lọc mục tiêu theo chu kỳ hoặc đơn vị phụ trách.

#### Các thao tác chính

- Chuyển giữa **Canvas** và **Danh sách**.
- Tìm kiếm và lọc.
- Mở **Chi tiết mục tiêu**.
- Mở **Nhật ký kiểm tra**.
- Đi tới **trang chi tiết** hoặc **thêm KR** nếu tài khoản có hỗ trợ.

#### Lưu ý khi sử dụng

- Canvas phù hợp để nhìn nhanh quan hệ và trạng thái.
- Danh sách phù hợp khi cần đọc dữ liệu có cấu trúc rõ hơn.
- Nếu một mục tiêu chưa có KR, mức độ phản ánh thực thi sẽ chưa đầy đủ.

### B. Trang Chi tiết mục tiêu

#### Mục đích của trang

Đây là nơi theo dõi sâu một Goal cụ thể, bao gồm thông tin mục tiêu, KR, Task, team tham gia và hiệu suất thực thi.

#### Các thông tin chính hiển thị

- Thông tin cơ bản của Goal: tên, loại, trạng thái, quý, năm, mô tả, ghi chú.
- **Tiến độ mục tiêu**.
- Tổng quan số lượng KR, Task và team tham gia.
- **Phòng ban tham gia & hiệu suất**.
- Danh sách **Key Result** dưới Goal.
- Các Task nằm dưới từng KR.
- Khu vực **Task chưa gắn key result**.
- Khu vực **Mục tiêu con** nếu có.
- Cột thông tin bên phải gồm thông tin chi tiết, hiệu suất thực thi và team tham gia.

#### Người dùng thường làm gì tại đây

- Đọc rõ mục tiêu này đang ở trạng thái nào.
- Xem KR nào đang kéo mục tiêu đi lên hoặc bị chậm.
- Xem Task đã được phân xuống đúng KR hay chưa.
- Kiểm tra phòng ban nào đang tham gia và mức đóng góp thực thi.
- Đi tiếp sang tạo KR hoặc tạo Task nếu tài khoản có hỗ trợ.

#### Khi nào nên dùng trang này

- Khi cần họp hoặc trao đổi về một mục tiêu cụ thể.
- Khi cần xem nguyên nhân vì sao một mục tiêu tăng chậm.
- Khi cần rà mối liên hệ giữa Goal, KR và Task.

#### Lưu ý khi sử dụng

- Hãy đọc Goal theo thứ tự: **mục tiêu -> KR -> Task**.
- Không nên đánh giá Goal chỉ dựa vào số Task đã làm.
- Nếu Task nằm ngoài khung thời gian của KR hoặc Goal, cần rà lại để tránh sai lệch khi theo dõi.

### C. Trang tạo / chỉnh sửa Mục tiêu và tạo KR

#### Mục đích của các biểu mẫu này

Giúp người dùng có quyền phù hợp thiết lập Goal và KR theo đúng cấu trúc hệ thống.

#### Các thông tin chính thường có trong biểu mẫu Goal

- Tên mục tiêu
- Loại
- Trạng thái
- Phòng ban chính
- Phòng ban tham gia
- Mục tiêu cha
- Quý và năm
- Thời gian bắt đầu và kết thúc
- Mô tả
- Ghi chú

#### Các thông tin chính trong biểu mẫu KR

- Tên KR
- Mô tả
- Phòng ban phụ trách
- Giá trị đo lường
- Mốc bắt đầu và kết thúc

#### Lưu ý khi sử dụng

- Goal nên thể hiện kết quả mong muốn, không phải danh sách việc.
- KR phải đo được.
- Nên tạo KR trước rồi mới phân Task xuống bên dưới để việc theo dõi được rõ ràng.

---

## 5.3 Công việc

Trang Công việc là nơi quản lý Task theo góc nhìn thực thi thực tế.

### A. Trang tổng quan Công việc

#### Mục đích của trang

Cho phép xem Task theo danh sách hoặc theo trục thời gian, đồng thời theo dõi Task trong mối liên hệ với Goal và KR.

#### Các thông tin chính hiển thị

Trang này hiện có:

- Chế độ **Gantt** và **Danh sách**.
- Chế độ cấu trúc theo **Mục tiêu**, **KR** hoặc **Công việc**.
- Ô tìm kiếm theo công việc, KR, mục tiêu, người phụ trách.
- Bộ lọc theo trạng thái, mục tiêu, key result và người phụ trách.
- Nút **Xóa lọc**.
- Các chỉ số nhanh gồm quá thời gian thực thi, kết thúc trong 7 ngày, đang thực thi và số dòng thiếu mốc thời gian.

#### Người dùng thường làm gì tại đây

- Xem toàn bộ công việc trong phạm vi của mình.
- Lọc theo Goal hoặc KR để theo dõi đúng bối cảnh.
- Lọc theo người phụ trách khi cần xem việc của từng cá nhân.
- Xem công việc nào sắp kết thúc hoặc đã quá hạn.

#### Khi nào nên dùng trang này

- Khi cần quản lý thực thi hằng ngày.
- Khi cần rà tiến độ công việc theo thời gian.
- Khi cần nhìn rõ việc nào đang nằm dưới KR nào.

### B. Chế độ Danh sách

#### Mục đích

Phù hợp khi cần đọc dữ liệu dạng bảng, lọc nhanh và rà từng dòng công việc.

#### Các chế độ xem hiện có

- Danh sách theo **Mục tiêu**
- Danh sách theo **KR**
- Danh sách theo **Công việc**

#### Thông tin thường thấy trên danh sách

- Tên công việc
- KR liên quan
- Goal liên quan
- Người phụ trách
- Trạng thái
- Tiến độ
- Thời gian thực thi

#### Thao tác chính

- Mở chi tiết công việc.
- Rà tiến độ và mốc thời gian theo từng dòng.
- Ở một số dòng công việc, hệ thống hỗ trợ cập nhật nhanh tiến độ hoặc thời gian thực thi ngay trên danh sách.

#### Lưu ý

- Danh sách giúp kiểm tra dữ liệu chính xác hơn Gantt khi cần rà từng cột thông tin.
- Nếu thấy ít dữ liệu hơn mong đợi, hãy kiểm tra lại bộ lọc và chế độ cấu trúc đang bật.

### C. Chế độ Gantt / Timeline thực thi

#### Mục đích

Phù hợp khi cần theo dõi Task theo mốc thời gian, phát hiện chồng chéo, thiếu mốc hoặc công việc sắp hết hạn.

#### Các tính năng chính

- Xem theo **Ngày**, **Tuần** hoặc **Tháng**.
- Nhóm dữ liệu theo **Mục tiêu**, **KR** hoặc **Công việc**.
- Cuộn ngang để xem thêm các mốc thời gian.
- Danh sách riêng cho các dòng **thiếu mốc thời gian**.

#### Người dùng thường làm gì tại đây

- Xem task nào đang chạy trong tuần hoặc tháng hiện tại.
- Phát hiện công việc chưa có thời gian thực thi.
- So sánh thời gian của Task với KR và Goal để tránh lệch kế hoạch.

#### Lưu ý

- Công việc không có thời gian thực thi sẽ không lên đúng thanh timeline và thường được gom vào nhóm thiếu mốc.
- Nếu task nằm ngoài khung KR hoặc Goal, cần rà lại để tránh hiểu sai tiến độ thực thi.

### D. Trang Chi tiết công việc

#### Mục đích của trang

Trang này dùng để xem và cập nhật chi tiết một Task cụ thể.

#### Các thông tin chính hiển thị

- Tên công việc
- Loại task
- Trọng số task
- Mô tả và ghi chú
- Trạng thái
- Tiến độ
- Người phụ trách
- Thời gian thực thi của công việc
- Khung thời gian KR
- Khung mục tiêu
- Thông tin KR liên quan

#### Người dùng thường làm gì tại đây

- Cập nhật tiến độ công việc.
- Kiểm tra task đang phục vụ KR nào.
- Chỉnh mốc thời gian task khi cần.
- Rà xem task đang nằm đúng trong khung của KR và Goal hay chưa.

#### Khi nào nên dùng trang này

- Khi cần cập nhật một công việc cụ thể.
- Khi cần làm rõ thông tin chi tiết trước khi trao đổi với quản lý hoặc đồng đội.
- Khi danh sách và Gantt chưa đủ để giải thích vấn đề.

### E. Trang tạo công việc

#### Mục đích

Dùng để tạo Task mới dưới đúng Goal và KR.

#### Thông tin chính trong biểu mẫu

- Goal
- KR
- Người phụ trách
- Loại task
- Trạng thái
- Trọng số
- Tiến độ
- Thời gian bắt đầu và kết thúc
- Mô tả
- Ghi chú

#### Lưu ý khi tạo Task

- Nên chọn đúng KR trước khi tạo Task.
- Nên nhập đủ thời gian thực thi nếu muốn task hiển thị rõ trên timeline.
- Task nên cụ thể, có thể thực hiện được, tránh viết giống Goal hoặc KR.

---

## 5.4 Chấm công

Trang Chấm công là nơi người dùng theo dõi lịch công cá nhân trong tháng và gửi yêu cầu điều chỉnh công khi cần.

### A. Trang Chấm công

#### Mục đích của trang

Giúp người dùng kiểm tra tình hình chấm công của bản thân và theo dõi các yêu cầu liên quan đến thời gian làm việc.

#### Các thông tin chính hiển thị

- Lịch công theo tháng.
- Trạng thái từng ngày trên lịch.
- Giờ check-in và check-out theo ngày.
- Thống kê tháng gồm số ngày làm việc, số ngày vắng, số phút thiếu và số phút tăng ca.
- Danh sách yêu cầu điều chỉnh công trong tháng.
- Bộ lọc yêu cầu theo trạng thái: tất cả, chờ duyệt, đã duyệt, từ chối.

#### Người dùng thường làm gì tại đây

- Kiểm tra ngày nào chấm công đầy đủ, ngày nào còn thiếu.
- Theo dõi tổng số phút thiếu hoặc tăng ca trong tháng.
- Xem yêu cầu điều chỉnh công của mình đang ở trạng thái nào.
- Tạo yêu cầu điều chỉnh khi có sai lệch.

#### Khi nào nên dùng trang này

- Cuối ngày hoặc đầu ngày để kiểm tra tình trạng chấm công.
- Cuối tuần hoặc cuối tháng để rà tổng giờ công.
- Khi thấy lịch công chưa phản ánh đúng thực tế làm việc.

#### Lưu ý khi sử dụng

- Hãy kiểm tra đúng tháng đang xem trước khi đối chiếu dữ liệu.
- Nếu số liệu chưa đúng như kỳ vọng, hãy kiểm tra lại yêu cầu đã gửi và trạng thái duyệt của yêu cầu đó.

### B. Trang tạo yêu cầu điều chỉnh công

#### Mục đích của trang

Dùng để gửi yêu cầu điều chỉnh liên quan đến thời gian làm việc.

#### Các loại yêu cầu đang có

- Thiếu thời gian có phép
- Thiếu thời gian không phép
- Tăng ca
- Làm việc từ xa

#### Các thông tin chính trong biểu mẫu

- Loại yêu cầu
- Ngày cần điều chỉnh
- Số phút điều chỉnh
- Lý do

#### Điểm cần lưu ý

- Với các yêu cầu liên quan đến nghỉ hoặc thiếu thời gian, nên điền lý do rõ ràng.
- Khi gửi yêu cầu phép trong tháng, hệ thống có phần tham khảo quỹ phép của tháng đang chọn.
- Sau khi gửi, nên quay lại trang Chấm công để theo dõi trạng thái xử lý.

---

## 5.5 Báo cáo

### Mục đích của trang

Trang Báo cáo giúp người dùng xem tổng hợp hiệu suất trong phạm vi hiện tại của mình.

### Các thông tin chính hiển thị

- Tổng số báo cáo
- Tiến độ trung bình
- Vai trò / phạm vi xem hiện tại
- Bảng báo cáo hiệu suất

### Các cột chính trong bảng

- Mã báo cáo
- Người dùng
- Tỷ lệ hoàn thành
- Số công việc
- Ngày tạo
- Ngày cập nhật

### Người dùng thường làm gì tại đây

- Xem bức tranh tổng hợp về hiệu suất.
- So sánh số lượng báo cáo và tỷ lệ hoàn thành trong phạm vi đang xem.
- Dùng làm điểm tham chiếu khi cần nhìn nhanh kết quả tổng hợp thay vì đi vào từng Task.

### Khi nào nên dùng trang này

- Khi cần xem báo cáo gọn, tổng hợp.
- Khi cần kiểm tra nhanh mặt bằng hiệu suất trong phạm vi hiện tại.

### Lưu ý khi sử dụng

- Phạm vi dữ liệu hiển thị phụ thuộc vào vai trò hoặc phạm vi xem đang áp dụng trên tài khoản.
- Báo cáo là góc nhìn tổng hợp; nếu cần tìm nguyên nhân chi tiết, nên mở thêm Mục tiêu, Công việc hoặc Hiệu suất phòng ban.

---

## 5.6 Hiệu suất phòng ban

### Mục đích của trang

Trang này dùng để theo dõi chất lượng thực thi ở cấp phòng ban, kết nối giữa mục tiêu, KR, Task, hạn hoàn thành, thành viên và rủi ro.

### Các thông tin chính hiển thị

Trang hiện có các nhóm nội dung sau:

- Bộ lọc theo phòng ban, quý, năm, trạng thái mục tiêu, thành viên, chỉ quá hạn và từ khóa tìm kiếm.
- Chế độ xem gồm **Tổng quan**, **Mục tiêu / KR** và **Thành viên**.
- Khối tóm tắt hiển thị phòng ban đang xem, quý / năm, sức khỏe thực thi và tiến độ phòng ban.
- Các thẻ tổng hợp
- Khối **Tiến độ phòng ban**
- Bảng **Thực thi theo mục tiêu / KR**
- Khối **Hiệu suất thành viên**
- Khối **Rủi ro**
- Khối **Hạn sắp tới**
- Khối **Hoạt động gần đây**

### Người dùng thường làm gì tại đây

- Xem phòng ban đang mạnh hay đang có rủi ro ở đâu.
- Xem mục tiêu nào đang tác động nhiều tới hiệu suất phòng ban.
- Rà KR trung bình, công việc quá hạn, thành viên có việc và thành viên có rủi ro.
- Xem các hạn hoàn thành gần nhất cần xử lý.
- Chuyển giữa góc nhìn mục tiêu và góc nhìn thành viên.

### Khi nào nên dùng trang này

- Khi cần theo dõi hiệu suất theo đơn vị phụ trách.
- Khi leader hoặc quản lý cần rà nhanh rủi ro thực thi.
- Khi cần chuẩn bị cho họp tiến độ phòng ban.

### Cách hiểu đúng một số chỉ số

- **Tiến độ phòng ban**: cho biết mức tiến triển chung của đơn vị trong phạm vi đang xem.
- **Sức khỏe thực thi**: cho biết tình trạng tổng quát như đúng tiến độ, có rủi ro hoặc chậm tiến độ.
- **Công việc quá hạn**: là tín hiệu cần xử lý sớm, nhưng không phải chỉ số duy nhất để đánh giá hiệu suất.

### Lưu ý khi sử dụng

- Luôn kiểm tra đúng phòng ban, quý, năm và bộ lọc trước khi đọc số liệu.
- Dùng tab **Mục tiêu / KR** khi cần xem nguyên nhân theo cấu trúc thực thi.
- Dùng tab **Thành viên** khi cần nhìn theo người thực hiện.

---

## 5.7 Phòng ban

### Mục đích của trang

Trang Phòng ban giúp người dùng hiểu cơ cấu tổ chức và xem thông tin chi tiết của từng đơn vị.

### Các thông tin chính hiển thị

- Chế độ **Tree** và **List**
- Tìm kiếm phòng ban
- Sơ đồ tổ chức dạng cây
- Danh sách phòng ban dạng bảng
- Panel chi tiết của phòng ban đang chọn

### Ở chế độ Tree

Người dùng có thể:

- Xem quan hệ cha - con giữa các phòng ban.
- Kéo sơ đồ để di chuyển.
- Zoom thu phóng để xem dễ hơn.
- Chọn một phòng ban để mở thông tin chi tiết.

Thông tin thường thấy trên card phòng ban:

- Tên phòng ban
- Mô tả ngắn
- Trưởng phòng
- Số lượng thành viên

### Ở chế độ List

Người dùng có thể xem:

- Tên phòng ban
- Phòng ban cha
- Trưởng phòng
- Số thành viên
- Ngày tạo

### Panel chi tiết phòng ban

Khi chọn một phòng ban, panel bên phải thường hiển thị:

- Trưởng phòng
- Số thành viên
- Phòng ban con
- Mô tả
- Danh sách thành viên

### Khi nào nên dùng trang này

- Khi cần hiểu cơ cấu tổ chức.
- Khi cần kiểm tra một người đang thuộc đơn vị nào.
- Khi cần biết trưởng phòng hoặc quy mô nhân sự của một đơn vị.

### Lưu ý khi sử dụng

- Chế độ Tree phù hợp để nhìn cấu trúc tổng thể.
- Chế độ List phù hợp để đọc thông tin nhanh và so sánh nhiều đơn vị.

---

## 5.8 Quản lý

Nhóm trang này phục vụ các nhu cầu quản lý và duyệt dữ liệu trong phạm vi tài khoản đang được hiển thị.

### A. Quản lý chấm công

#### Mục đích của trang

Cho phép người quản lý xem lịch chấm công của nhân sự trong phạm vi mình phụ trách.

#### Các thông tin chính hiển thị

- Danh sách **Nhân sự trong phạm vi**
- Ô tìm kiếm theo tên, email, vai trò
- Thẻ thông tin nhanh của nhân sự được chọn
- Màn hình chấm công chi tiết của nhân sự đó

#### Người dùng thường làm gì tại đây

- Tìm một nhân sự cụ thể.
- Xem lịch công theo tháng của nhân sự.
- Theo dõi ngày thiếu công, tăng ca và thống kê liên quan.
- Xuất dữ liệu chấm công khi cần.

#### Khi nào nên dùng trang này

- Khi leader hoặc quản lý cần đối chiếu chấm công của đội ngũ.
- Khi cần hỗ trợ xác minh dữ liệu chấm công cho một nhân sự.

#### Lưu ý khi sử dụng

- Trang này là góc nhìn quản lý; khác với trang Chấm công cá nhân.
- Dữ liệu xem được phụ thuộc phạm vi quản lý của tài khoản.

### B. Quản lý yêu cầu thời gian

#### Mục đích của trang

Cho phép leader hoặc quản lý xem và duyệt các yêu cầu liên quan đến thời gian làm việc.

#### Các thông tin chính hiển thị

- Tổng số yêu cầu
- Số yêu cầu chờ duyệt
- Số yêu cầu đã duyệt
- Số yêu cầu đã từ chối
- Bảng danh sách yêu cầu
- Bộ lọc theo trạng thái: tất cả, chờ duyệt, đã duyệt, từ chối.

#### Thông tin chính trong bảng

- Nhân sự
- Ngày cần sửa
- Loại yêu cầu
- Thời lượng
- Lý do
- Ngày gửi
- Trạng thái
- Bạn đã duyệt
- Thao tác duyệt hoặc từ chối

#### Người dùng thường làm gì tại đây

- Xem yêu cầu nào đang chờ xử lý.
- Đọc lý do và thời lượng yêu cầu.
- Thực hiện **Duyệt** hoặc **Từ chối**.
- Theo dõi mình đã duyệt yêu cầu nào.

#### Khi nào nên dùng trang này

- Khi có nhân sự gửi yêu cầu điều chỉnh công.
- Khi cần rà số lượng yêu cầu đang tồn.

#### Lưu ý khi sử dụng

- Nên kiểm tra kỹ loại yêu cầu, ngày cần sửa và lý do trước khi duyệt.
- Nếu không có phạm vi duyệt phù hợp, hệ thống có thể chỉ hiển thị thông báo thay vì danh sách yêu cầu.

---

## 5.9 Hồ sơ cá nhân và tài khoản

### A. Hồ sơ cá nhân

#### Mục đích của trang

Giúp người dùng quản lý thông tin cá nhân và thông tin liên quan đến đơn vị, vai trò.

#### Các thông tin chính hiển thị

- **Thông tin cá nhân**
- **Phân quyền và đơn vị**
- **Bảo mật**
- Ảnh đại diện
- Các mốc thời gian liên quan đến hồ sơ

#### Người dùng thường làm gì tại đây

- Cập nhật họ tên, số điện thoại hoặc ảnh đại diện.
- Xem mình đang thuộc phòng ban nào.
- Xem vai trò đang gắn với đơn vị nào.
- Đi tới trang đổi mật khẩu.

#### Lưu ý khi sử dụng

- Nên cập nhật hồ sơ đầy đủ để việc hiển thị trong các trang khác được rõ ràng.
- Nếu thấy thông tin phòng ban hoặc vai trò chưa đúng, cần liên hệ bộ phận phụ trách để kiểm tra.

### B. Đổi mật khẩu

#### Mục đích của trang

Cho phép người dùng cập nhật mật khẩu tài khoản.

#### Các thao tác chính

- Nhập mật khẩu hiện tại nếu cần
- Nhập mật khẩu mới
- Xác nhận mật khẩu mới
- Cập nhật mật khẩu

#### Lưu ý khi sử dụng

- Mật khẩu mới cần đủ độ dài theo yêu cầu của hệ thống.
- Nếu quên mật khẩu, có thể dùng luồng **Quên mật khẩu** thay vì đổi mật khẩu từ trong hồ sơ.

### C. Đăng nhập, Quên mật khẩu và Đặt lại mật khẩu

#### Mục đích của các trang này

- **Đăng nhập**: vào hệ thống bằng email và mật khẩu.
- **Quên mật khẩu**: gửi yêu cầu hỗ trợ đặt lại mật khẩu.
- **Đặt lại mật khẩu**: thiết lập mật khẩu mới sau khi nhận được liên kết hỗ trợ.

#### Khi nào nên dùng

- Dùng **Đăng nhập** khi bắt đầu vào hệ thống.
- Dùng **Quên mật khẩu** khi không còn nhớ mật khẩu hiện tại.
- Dùng **Đặt lại mật khẩu** sau khi nhận được hướng dẫn khôi phục.

---

## 6. Giải thích các khái niệm quan trọng

| Thuật ngữ | Giải thích dễ hiểu |
| --- | --- |
| **Goal** | Mục tiêu ở mức cao hơn, là cái đích cần đạt |
| **KR** | Kết quả then chốt hoặc chỉ số đo mức độ tiến tới Goal |
| **Task** | Việc cụ thể cần làm để tạo ra kết quả |
| **Tiến độ** | Mức độ hoàn thành hiện tại của Goal, KR hoặc Task |
| **Trạng thái** | Tình trạng hiện tại của một mục tiêu, công việc hoặc yêu cầu |
| **Người phụ trách** | Người chịu trách nhiệm trực tiếp theo dõi hoặc thực hiện công việc |
| **Chủ sở hữu** | Người hoặc đơn vị chịu trách nhiệm chính ở mức mục tiêu hoặc phạm vi quản lý |
| **Thời gian thực thi** | Khoảng thời gian công việc được lên kế hoạch để thực hiện |
| **Hạn hoàn thành** | Mốc kết thúc cần bám theo của công việc hoặc hạng mục đang theo dõi |
| **Phòng ban tham gia** | Các đơn vị cùng tham gia vào một Goal |
| **Hiệu suất phòng ban** | Mức độ thực thi và đóng góp của phòng ban trong phạm vi mục tiêu đang theo dõi |
| **Yêu cầu thời gian** | Yêu cầu điều chỉnh công, nghỉ, tăng ca hoặc làm việc từ xa |
| **Chấm công** | Dữ liệu phản ánh giờ làm việc, ngày công và các sai lệch thời gian |

### Nguyên tắc nhớ nhanh

- **Goal = Đích đến**
- **KR = Thước đo**
- **Task = Việc phải làm**
- **Tiến độ = Đang đi được bao xa**
- **Hiệu suất = Mức độ thực thi đang tốt đến đâu**

---

## 7. Cách sử dụng hệ thống hiệu quả

- Nên bắt đầu ngày làm việc từ **Bảng điều khiển** để nắm nhanh tổng quan.
- Hãy xem **Mục tiêu** trước khi đi sâu vào từng Task nếu bạn cần hiểu bối cảnh công việc.
- Khi tạo hoặc cập nhật Task, nên gắn đúng Goal và KR liên quan.
- Luôn nhập đủ **thời gian thực thi** cho Task nếu muốn theo dõi trên timeline rõ ràng.
- Thường xuyên rà khối **Hạn sắp tới** và danh sách công việc sắp kết thúc.
- Dùng bộ lọc trên trang **Công việc** và **Hiệu suất phòng ban** để xem đúng phạm vi cần theo dõi.
- Khi thấy số liệu giữa các trang khác nhau, hãy kiểm tra lại bộ lọc, tháng, quý, năm hoặc người phụ trách đang chọn.
- Cuối ngày hoặc cuối tuần, nên vào **Chấm công** để kiểm tra sớm các sai lệch về thời gian.
- Với leader và quản lý, nên duy trì thói quen kiểm tra **Quản lý yêu cầu thời gian** và **Quản lý chấm công** theo chu kỳ cố định.
- Khi cần nhìn theo đơn vị thay vì theo cá nhân, hãy ưu tiên **Hiệu suất phòng ban**.

---

## 8. Những lỗi thường gặp khi sử dụng

| Lỗi thường gặp | Vì sao dễ xảy ra | Cách tránh |
| --- | --- | --- |
| Không cập nhật tiến độ công việc | Người dùng hoàn thành việc nhưng quên cập nhật hệ thống | Dành thời điểm cố định trong ngày để cập nhật |
| Tạo công việc nhưng thiếu thời gian thực thi | Chỉ nhập tên việc mà bỏ qua mốc thời gian | Luôn kiểm tra ngày bắt đầu và kết thúc trước khi lưu |
| Nhầm giữa Goal, KR và Task | Viết Goal như một đầu việc hoặc viết KR như một hoạt động | Nhớ quy tắc: Goal là đích, KR là số đo, Task là việc làm |
| Xem sai bộ lọc nên tưởng thiếu dữ liệu | Bộ lọc theo trạng thái, người phụ trách, quý hoặc năm đang làm hẹp phạm vi | Kiểm tra bộ lọc trước khi kết luận dữ liệu thiếu |
| Chỉ xem Bảng điều khiển rồi nghĩ đã đủ chi tiết | Bảng điều khiển là màn hình tổng quan, không phải nơi quản lý sâu | Khi cần rõ nguyên nhân, mở tiếp Mục tiêu hoặc Công việc |
| Hoàn thành Task nhưng Goal hoặc KR không tăng như mong muốn | Task chỉ là hành động, không tự động đồng nghĩa với kết quả | Rà lại KR đang đo cái gì và Task có thực sự tác động vào KR không |
| Không gắn Task đúng Goal hoặc KR | Tạo việc nhanh nhưng thiếu liên kết bối cảnh | Chọn đúng Goal và KR trước khi tạo Task |
| Không kiểm tra đúng tháng ở Chấm công | Chuyển tháng nhưng quên đối chiếu theo tháng đang xem | Luôn nhìn lại tháng hiển thị ở đầu trang chấm công |
| Duyệt yêu cầu thời gian quá nhanh mà không đọc lý do | Muốn xử lý nhanh nhưng bỏ qua bối cảnh | Kiểm tra ngày, loại yêu cầu, thời lượng và lý do trước khi duyệt |

---

## 9. Câu hỏi thường gặp (FAQ)

### Tôi nên bắt đầu xem từ trang nào?

Nên bắt đầu từ **Bảng điều khiển**. Đây là nơi nhanh nhất để nắm tình hình trong ngày trước khi đi vào từng module chi tiết.

### Khi nào dùng trang Mục tiêu, khi nào dùng trang Công việc?

- Dùng **Mục tiêu** khi bạn muốn hiểu bức tranh lớn, Goal nào đang được theo đuổi và KR nào đang đo tiến độ.
- Dùng **Công việc** khi bạn muốn quản lý các việc cụ thể, xem timeline hoặc cập nhật tiến độ task.

### Vì sao có công việc không hiển thị trên timeline?

Lý do thường gặp là:

- công việc chưa có thời gian thực thi rõ ràng
- bộ lọc đang làm hẹp dữ liệu
- bạn đang đứng ở chế độ cấu trúc khác với dữ liệu cần xem

### Vì sao dữ liệu giữa các trang có thể khác nhau?

Các trang có thể đang dùng phạm vi xem khác nhau, ví dụ:

- khác bộ lọc
- khác tháng, quý hoặc năm
- khác người phụ trách
- khác góc nhìn tổng quan và chi tiết

Vì vậy, trước khi so sánh dữ liệu, hãy kiểm tra lại phạm vi đang xem.

### Tôi nên xem hiệu suất ở đâu?

- Xem nhanh ở **Bảng điều khiển** nếu chỉ cần tín hiệu tổng quan.
- Xem ở **Báo cáo** nếu cần bảng tổng hợp hiệu suất.
- Xem ở **Hiệu suất phòng ban** nếu cần phân tích sâu theo phòng ban, thành viên, rủi ro và hạn hoàn thành.

### Khi nào dùng Chấm công và khi nào dùng Quản lý chấm công?

- **Chấm công** dùng cho góc nhìn cá nhân.
- **Quản lý chấm công** dùng cho leader hoặc quản lý muốn xem lịch công của nhân sự trong phạm vi phụ trách.

### Khi nào dùng Quản lý yêu cầu thời gian?

Khi bạn có trách nhiệm xem xét và xử lý các yêu cầu điều chỉnh công hoặc thời gian làm việc của người khác trong phạm vi được giao.

### Nếu tôi hoàn thành hết Task nhưng KR chưa đạt thì sao?

Điều đó có nghĩa là công việc đã làm chưa đủ để tạo ra kết quả đo lường mong muốn, hoặc KR đang được theo dõi bằng một chỉ số chưa thay đổi tương ứng. Khi đó cần rà lại cách làm, không nên chỉ nhìn vào số lượng Task đã hoàn thành.

### Tôi cần xem cơ cấu tổ chức và thành viên ở đâu?

Hãy vào trang **Phòng ban**. Bạn có thể xem theo sơ đồ cây hoặc danh sách, đồng thời mở panel chi tiết của từng đơn vị.

### Tôi cần cập nhật thông tin cá nhân hoặc đổi mật khẩu ở đâu?

Vào **Hồ sơ cá nhân** để cập nhật thông tin và ảnh đại diện. Nếu cần đổi mật khẩu, dùng trang **Đổi mật khẩu** từ trong hồ sơ.

---

## 10. Kết luận

TCM không chỉ là nơi ghi nhận công việc, mà là hệ thống giúp kết nối giữa định hướng, kết quả và thực thi hằng ngày.

Để sử dụng hiệu quả, hãy ghi nhớ:

- Bắt đầu từ **Bảng điều khiển** để nắm tổng quan.
- Dùng **Mục tiêu** để hiểu đích đến và các KR đang đo tiến triển.
- Dùng **Công việc** để bám sát việc thực hiện và mốc thời gian.
- Dùng **Chấm công** và các trang **Quản lý** để bảo đảm dữ liệu thời gian làm việc được rõ ràng.
- Dùng **Báo cáo** và **Hiệu suất phòng ban** để đánh giá kết quả ở mức tổng hợp và mức quản lý.
- Dùng **Phòng ban** và **Hồ sơ cá nhân** để hiểu đúng bối cảnh tổ chức và thông tin người dùng.

Khi mọi người cùng dùng hệ thống đúng cách, TCM sẽ giúp công việc minh bạch hơn, phối hợp dễ hơn và việc theo dõi kết quả trở nên rõ ràng hơn trong toàn tổ chức.
