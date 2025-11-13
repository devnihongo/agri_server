/**
 * Created by CTT VNPAY
 */

let express = require('express');
let router = express.Router();
let $ = require('jquery');
const request = require('request');
const moment = require('moment');

// SỬA: Thêm 2 thư viện này lên đầu để quản lý tập trung
const querystring = require('qs');
const crypto = require("crypto");

router.get('/', function(req, res, next){
    res.render('orderlist', { title: 'Danh sách đơn hàng' })
});

router.get('/create_payment_url', function (req, res, next) {
    res.render('order', {title: 'Tạo mới đơn hàng', amount: 10000})
});

router.get('/querydr', function (req, res, next) {
    
    let desc = 'truy van ket qua thanh toan';
    res.render('querydr', {title: 'Truy vấn kết quả thanh toán'})
});

router.get('/refund', function (req, res, next) {
    
    let desc = 'Hoan tien GD thanh toan';
    res.render('refund', {title: 'Hoàn tiền giao dịch thanh toán'})
});


router.post('/create_payment_url', function (req, res, next) {
    
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    
    let date = new Date();
    let createDate = moment(date).format('YYYYMMDDHHmmss');
    
    // SỬA LỖI 1 (IP): Lấy IP đầu tiên từ chuỗi proxy
    let ipAddrRaw = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    let ipAddr = ipAddrRaw.split(',')[0].trim();

    let config = require('config');
    
    let tmnCode = config.get('vnp_TmnCode');
    let secretKey = config.get('vnp_HashSecret');
    let vnpUrl = config.get('vnp_Url');
    let returnUrl = config.get('vnp_ReturnUrl');
    
    let orderId = req.body.orderId;
    
    // SỬA LỖI 2 (TXNREF): Xóa dấu gạch ngang '-'
    let cleanOrderId = orderId.replace(/-/g, '');
    
    let amount = req.body.amount;
    
    // SỬA LỖI 3 (ORDERINFO): Tạo chuỗi sạch, không dấu, không cách
    let orderInfo = 'ThanhToanDonHang' + cleanOrderId;

    let bankCode = req.body.bankCode;
    
    let locale = 'vn'; // Gán cứng 'vn'
    let currCode = 'VND';
    let vnp_Params = {};
    vnp_Params['vnp_Version'] = '2.1.0';
    vnp_Params['vnp_Command'] = 'pay';
    vnp_Params['vnp_TmnCode'] = tmnCode;
    vnp_Params['vnp_Locale'] = locale;
    vnp_Params['vnp_CurrCode'] = currCode;
    vnp_Params['vnp_TxnRef'] = cleanOrderId; // Dùng mã sạch
    vnp_Params['vnp_OrderInfo'] = orderInfo; // Dùng thông tin sạch
    vnp_Params['vnp_OrderType'] = 'other';
    vnp_Params['vnp_Amount'] = amount * 100;
    vnp_Params['vnp_ReturnUrl'] = returnUrl;
    vnp_Params['vnp_IpAddr'] = ipAddr; // Dùng IP sạch
    vnp_Params['vnp_CreateDate'] = createDate;
    if(bankCode !== null && bankCode !== ''){
        vnp_Params['vnp_BankCode'] = bankCode;
    }

    // ======================================================
    // SỬA LỖI 4 (BẢO MẬT vnp_SecureHash)
    // ======================================================

    // 1. Sắp xếp (dùng hàm sortObject ĐÚNG ở cuối file)
    vnp_Params = sortObject(vnp_Params);

    // 2. Tạo chuỗi query (KHÔNG encode)
    let signData = querystring.stringify(vnp_Params, { encode: false });
    
    // 3. Tạo chữ ký
    let hmac = crypto.createHmac("sha512", secretKey);
    // SỬA: Dùng Buffer.from thay vì 'new Buffer' (đã cũ)
    let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); 
    
    // 4. Gán chữ ký
    vnp_Params['vnp_SecureHash'] = signed;

    // 5. Tạo URL cuối cùng (BẮT BUỘC PHẢI encode)
    vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: true });

    // ======================================================

    res.status(200).json({ code: '00', message: 'success', data: vnpUrl });
});

router.get('/vnpay_return', function (req, res, next) {
    let vnp_Params = req.query;

    let secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params); // SỬA: Dùng hàm sortObject đúng

    let config = require('config');
    let tmnCode = config.get('vnp_TmnCode');
    let secretKey = config.get('vnp_HashSecret');

    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", secretKey);
    // SỬA: Dùng Buffer.from
    let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");     

    if(secureHash === signed){
        //Kiem tra xem du lieu trong db co hop le hay khong va thong bao ket qua
        res.render('success', {code: vnp_Params['vnp_ResponseCode']})
    } else{
        res.render('success', {code: '97'})
    }
});


router.get('/vnpay_ipn', function (req, res, next) {
    let vnp_Params = req.query;
    let secureHash = vnp_Params['vnp_SecureHash'];
    
    let orderId = vnp_Params['vnp_TxnRef'];
    let rspCode = vnp_Params['vnp_ResponseCode'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params); // SỬA: Dùng hàm sortObject đúng
    let config = require('config');
    let secretKey = config.get('vnp_HashSecret');
    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", secretKey);
    // SỬA: Dùng Buffer.from
    let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");     
    
    let paymentStatus = '0'; 
    let checkOrderId = true;
    let checkAmount = true;
    if(secureHash === signed){ //kiểm tra checksum
        if(checkOrderId){
            if(checkAmount){
                if(paymentStatus=="0"){ //kiểm tra tình trạng giao dịch trước khi cập nhật tình trạng thanh toán
                    if(rspCode=="00"){
                        //thanh cong
                        //paymentStatus = '1'
                        // Ở đây cập nhật trạng thái giao dịch thanh toán thành công vào CSDL của bạn
                        res.status(200).json({RspCode: '00', Message: 'Success'})
                    }
                    else {
                        //that bai
                        //paymentStatus = '2'
                        // Ở đây cập nhật trạng thái giao dịch thanh toán thất bại vào CSDL của bạn
                        res.status(200).json({RspCode: '00', Message: 'Success'})
                    }
                }
                else{
                    res.status(200).json({RspCode: '02', Message: 'This order has been updated to the payment status'})
                }
            }
            else{
                res.status(200).json({RspCode: '04', Message: 'Amount invalid'})
            }
        }       
        else {
            res.status(200).json({RspCode: '01', Message: 'Order not found'})
        }
    }
    else {
        res.status(200).json({RspCode: '97', Message: 'Checksum failed'})
    }
});

router.post('/querydr', function (req, res, next) {
    
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    let date = new Date();

    let config = require('config');
    
    let vnp_TmnCode = config.get('vnp_TmnCode');
    let secretKey = config.get('vnp_HashSecret');
    let vnp_Api = config.get('vnp_Api');
    
    let vnp_TxnRef = req.body.orderId;
    let vnp_TransactionDate = req.body.transDate;
    
    let vnp_RequestId =moment(date).format('HHmmss');
    let vnp_Version = '2.1.0';
    let vnp_Command = 'querydr';
    let vnp_OrderInfo = 'Truy van GD ma:' + vnp_TxnRef;
    
    let ipAddrRaw = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    // SỬA LỖI IP: Thêm dòng này
    let vnp_IpAddr = ipAddrRaw.split(',')[0].trim();

    let currCode = 'VND';
    let vnp_CreateDate = moment(date).format('YYYYMMDDHHmmss');
    
    let data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TxnRef + "|" + vnp_TransactionDate + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;
    
    let hmac = crypto.createHmac("sha512", secretKey);
    // SỬA: Dùng Buffer.from
    let vnp_SecureHash = hmac.update(Buffer.from(data, 'utf-8')).digest("hex"); 
    
    let dataObj = {
        'vnp_RequestId': vnp_RequestId,
        'vnp_Version': vnp_Version,
        'vnp_Command': vnp_Command,
        'vnp_TmnCode': vnp_TmnCode,
        'vnp_TxnRef': vnp_TxnRef,
        'vnp_OrderInfo': vnp_OrderInfo,
        'vnp_TransactionDate': vnp_TransactionDate,
        'vnp_CreateDate': vnp_CreateDate,
        'vnp_IpAddr': vnp_IpAddr,
        'vnp_SecureHash': vnp_SecureHash
    };

    request({
        url: vnp_Api,
        method: "POST",
        json: true,   
        body: dataObj
            }, function (error, response, body){
                console.log(response);
            });

});

router.post('/refund', function (req, res, next) {
    
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    let date = new Date();

    let config = require('config');
   
    let vnp_TmnCode = config.get('vnp_TmnCode');
    let secretKey = config.get('vnp_HashSecret');
    let vnp_Api = config.get('vnp_Api');
    
    let vnp_TxnRef = req.body.orderId;
    let vnp_TransactionDate = req.body.transDate;
    let vnp_Amount = req.body.amount *100;
    let vnp_TransactionType = req.body.transType;
    let vnp_CreateBy = req.body.user;
            
    let currCode = 'VND';
    
    let vnp_RequestId = moment(date).format('HHmmss');
    let vnp_Version = '2.1.0';
    let vnp_Command = 'refund';
    let vnp_OrderInfo = 'Hoan tien GD ma:' + vnp_TxnRef;
            
    let ipAddrRaw = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    // SỬA LỖI IP: Thêm dòng này
    let vnp_IpAddr = ipAddrRaw.split(',')[0].trim();
    
    let vnp_CreateDate = moment(date).format('YYYYMMDDHHmmss');
    
    let vnp_TransactionNo = '0';
    
    let data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TransactionType + "|" + vnp_TxnRef + "|" + vnp_Amount + "|" + vnp_TransactionNo + "|" + vnp_TransactionDate + "|" + vnp_CreateBy + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;
    let hmac = crypto.createHmac("sha512", secretKey);
    // SỬA: Dùng Buffer.from
    let vnp_SecureHash = hmac.update(Buffer.from(data, 'utf-8')).digest("hex");
    
     let dataObj = {
        'vnp_RequestId': vnp_RequestId,
        'vnp_Version': vnp_Version,
        'vnp_Command': vnp_Command,
        'vnp_TmnCode': vnp_TmnCode,
        'vnp_TransactionType': vnp_TransactionType,
        'vnp_TxnRef': vnp_TxnRef,
        'vnp_Amount': vnp_Amount,
        'vnp_TransactionNo': vnp_TransactionNo,
        'vnp_CreateBy': vnp_CreateBy,
        'vnp_OrderInfo': vnp_OrderInfo,
        'vnp_TransactionDate': vnp_TransactionDate,
        'vnp_CreateDate': vnp_CreateDate,
        'vnp_IpAddr': vnp_IpAddr,
        'vnp_SecureHash': vnp_SecureHash
    };
    
    request({
        url: vnp_Api,
        method: "POST",
        json: true,   
        body: dataObj
            }, function (error, response, body){
                console.log(response);
            });
    
});

/* // HÀM CŨ BỊ LỖI (Gây sai chữ ký)
function sortObject(obj) {
	let sorted = {};
	let str = [];
	let key;
	for (key in obj){
		if (obj.hasOwnProperty(key)) {
		str.push(encodeURIComponent(key));
		}
	}
	str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}
*/

// HÀM MỚI ĐÃ SỬA (Chỉ sắp xếp, KHÔNG encode)
function sortObject(obj) {
	let sorted = {};
	let str = [];
	let key;
	for (key in obj){
		if (obj.hasOwnProperty(key)) {
            // SỬA: Chỉ push key, không encode
			str.push(key);
		}
	}
	str.sort();
    for (key = 0; key < str.length; key++) {
        // SỬA: Chỉ gán giá trị, không encode
        sorted[str[key]] = obj[str[key]];
    }
    return sorted;
}

module.exports = router;