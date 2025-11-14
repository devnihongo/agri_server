var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var cors = require('cors'); // <-- THÊM MỚI: Bắt buộc để client gọi được API
var order = require('./routes/order');

var app = express();

// --- KÍCH HOẠT CORS ---
// Cho phép tất cả các domain khác (ví dụ app của bạn) gọi được API này
app.use(cors());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade'); // Giữ nguyên 'jade' như file gốc của bạn

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));

// SỬA: Dùng middleware tích hợp của Express thay cho bodyParser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/order', order);
app.get('/', (req, res) => {
  res.redirect('/order');
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


// --- THÊM MỚI: Khối khởi động server ---
// Sử dụng cổng của Render (process.env.PORT) hoặc 3000 khi chạy local
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server VNPay đang chạy tại cổng ${port}`);
});
// ------------------------------------


module.exports = app;