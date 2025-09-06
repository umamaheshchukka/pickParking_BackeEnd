require("dotenv").config();
const http = require("http");
const path = require("path"); // Added path module
const socketIo = require("socket.io");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { checkSchema } = require("express-validator");
const configDb = require("./config/db");
const nodeCronCtlr = require("./app/node-cron/bookingStatus");

const {
  userRegisterSchemaValidation,
  usersLoginSchema,
  usersForgotPasswordSchema,
  usersSetPasswordSchema,
  userOtpValidation,
  usersupdatePasswordValidationSchema,
} = require("./app/validations/user-validation");
const {
  ParkingSpaceSchemaValidation,
  parkingSpaceApproveValidarion,
} = require("./app/validations/parkingSpace-validation");
const { reviesValidation } = require("./app/validations/revies-validation");
const vehicleValidationSchema = require("./app/validations/vehicle-validation");
const {
  bookingParkingSpaceValidation,
} = require("./app/validations/booking-validation");

const { authenticateUser, authorizeUser } = require("./app/middlewares/auth");

const usersCntrl = require("./app/controllers/user-controller");
const parkingSpaceCntrl = require("./app/controllers/parkingSpace-controllers");
const reviewsController = require("./app/controllers/revies-controller");
const vehicleCtlr = require("./app/controllers/vehivle-controller");
const bookingCntrl = require("./app/controllers/booking-controller");
const paymentsCntrl = require("./app/controllers/payment-controller");
const spaceCartCtlr = require("./app/controllers/spacecart-controller");

const app = express();
const port = process.env.PORT || 3045; // Use environment variable for port
const server = http.createServer(app);

// Configure Socket.IO with specific origins for security
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*", // Use environment variable for CORS origin
    methods: ["GET", "POST"],
  },
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Initialize database connection
const startServer = async () => {
  try {
    await configDb(); // Ensure DB connection is successful
    console.log("Database connected successfully");

    // Start cron job after DB connection
    nodeCronCtlr();

    // Start the server
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1); // Exit if DB connection fails
  }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer configuration with file type and size validation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only JPEG, PNG, and PDF are allowed."),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// User APIs
app.post(
  "/api/users/register",
  checkSchema(userRegisterSchemaValidation),
  usersCntrl.register
);
app.put(
  "/api/users/verify/email",
  checkSchema(userOtpValidation),
  usersCntrl.verifyEmail
);
app.post("/api/users/login", checkSchema(usersLoginSchema), usersCntrl.login);
app.put(
  "/api/users/update/password",
  authenticateUser,
  checkSchema(usersupdatePasswordValidationSchema),
  usersCntrl.updatePassword
);
app.get("/api/users/account", authenticateUser, usersCntrl.accounts);
app.post(
  "/api/users/forgot-password",
  checkSchema(usersForgotPasswordSchema),
  usersCntrl.forgotPassword
);
app.put(
  "/api/users/set-forgot-password",
  checkSchema(usersSetPasswordSchema),
  usersCntrl.setFogotPassword
);
app.get(
  "/api/users/verify/otp",
  checkSchema(userOtpValidation),
  usersCntrl.verifyOtp
);

// Owner APIs
app.post(
  "/api/parking-spaces/register",
  authenticateUser,
  authorizeUser(["customer", "owner"]),
  checkSchema(ParkingSpaceSchemaValidation),
  upload.single("image"),
  parkingSpaceCntrl.register
);
app.get(
  "/api/parking-spaces/my",
  authenticateUser,
  authorizeUser(["owner", "admin", "customer"]),
  parkingSpaceCntrl.mySpace
);
app.delete(
  "/api/parking-spaces/:id",
  authenticateUser,
  authorizeUser(["owner"]),
  parkingSpaceCntrl.remove
);
app.put(
  "/api/parking-spaces/update/:id",
  authenticateUser,
  authorizeUser(["customer", "owner"]),
  checkSchema(ParkingSpaceSchemaValidation),
  upload.single("image"), // Added validation for consistency
  parkingSpaceCntrl.update
);
app.get(
  "/api/parking-spaces/my/bookings",
  authenticateUser,
  authorizeUser(["owner"]),
  bookingCntrl.myParkingSpace
);
app.put(
  "/api/bookings/approve/:id",
  authenticateUser,
  authorizeUser(["owner"]),
  (req, res) => bookingCntrl.accept(req, res, io)
);
app.put(
  "/api/parking-spaces/disable/:id",
  authenticateUser,
  authorizeUser(["owner"]),
  parkingSpaceCntrl.disable
);

// Admin APIs
app.get(
  "/api/parking-spaces",
  authenticateUser,
  authorizeUser(["admin"]),
  parkingSpaceCntrl.list
);
app.get(
  "/api/owners",
  authenticateUser,
  authorizeUser(["admin"]),
  usersCntrl.listOwner
);
app.get(
  "/api/customers",
  authenticateUser,
  authorizeUser(["admin"]),
  usersCntrl.listCustomer
);
app.put(
  "/api/parking-spaces/approve/:id",
  authenticateUser,
  authorizeUser(["admin"]),
  checkSchema(parkingSpaceApproveValidarion),
  parkingSpaceCntrl.approve
);
app.get(
  "/api/bookings",
  authenticateUser,
  authorizeUser(["admin"]),
  bookingCntrl.listBookings
);

// Public APIs
app.get("/api/parking-spaces/radius", parkingSpaceCntrl.findByLatAndLog);
app.get(
  "/api/parking-spaces/:parkingSpaceId/space-types/:spaceTypeId",
  bookingCntrl.findSpace
);

// Vehicle APIs
app.post(
  "/api/vehicles/register",
  authenticateUser,
  authorizeUser(["customer"]),
  checkSchema(vehicleValidationSchema),
  upload.single("documents"),
  vehicleCtlr.create
);
app.get(
  "/api/vehicles",
  authenticateUser,
  authorizeUser(["customer"]),
  vehicleCtlr.list
);
app.put(
  "/api/vehicles/update/:id",
  authenticateUser,
  authorizeUser(["customer"]),
  checkSchema(vehicleValidationSchema),
  upload.single("documents"),
  vehicleCtlr.update
);
app.put(
  "/api/vehicles/approve/:id",
  authenticateUser,
  authorizeUser(["admin"]),
  vehicleCtlr.approve
);
app.delete(
  "/api/vehicles/:id",
  authenticateUser,
  authorizeUser(["customer"]),
  vehicleCtlr.remove
);

// Review APIs
app.post(
  "/api/bookings/:bookingId/parking-spaces/:parkingSpaceId/reviews",
  authenticateUser,
  authorizeUser(["customer"]),
  checkSchema(reviesValidation),
  reviewsController.create
);
app.get("/api/reviews", authenticateUser, reviewsController.list);
app.get(
  "/api/parking-spaces/:id/reviews",
  authenticateUser,
  authorizeUser(["owner"]),
  reviewsController.spaceReview
);
app.delete(
  "/api/reviews/:id",
  authenticateUser,
  authorizeUser(["customer"]),
  reviewsController.remove
);
app.put(
  "/api/reviews/:id",
  authenticateUser,
  authorizeUser(["customer"]),
  checkSchema(reviesValidation),
  reviewsController.update
);

// Booking APIs
app.post(
  "/api/parking-spaces/:parkingSpaceId/space-types/:spaceTypesId/bookings",
  authenticateUser,
  authorizeUser(["customer"]),
  checkSchema(bookingParkingSpaceValidation),
  bookingCntrl.booking
);
app.get("/api/bookings/my/:id", bookingCntrl.list);
app.get(
  "/api/bookings/my",
  authenticateUser,
  authorizeUser(["customer"]),
  bookingCntrl.MyBookings
);

// Space Cart APIs
app.post(
  "/api/space-carts/:id",
  authenticateUser,
  authorizeUser(["customer"]),
  spaceCartCtlr.create
);
app.delete(
  "/api/space-carts/:id",
  authenticateUser,
  authorizeUser(["customer"]),
  spaceCartCtlr.remove
);
app.get(
  "/api/space-carts",
  authenticateUser,
  authorizeUser(["customer"]),
  spaceCartCtlr.list
);

// Admin Query API
app.get(
  "/api/owners/query",
  authenticateUser,
  authorizeUser(["admin"]),
  usersCntrl.findOwners
);

// Payment APIs
app.put("/api/bookings/:id/payment", bookingCntrl.updatePayment);
app.put("/api/bookings/:id/payment/failed", bookingCntrl.paymentFailerUpdate);
app.post("/api/payments/create-checkout-session", paymentsCntrl.pay);
app.put("/api/payments/:id/success", paymentsCntrl.successUpdate);
app.put("/api/payments/:id/failed", paymentsCntrl.failerUpdate);

// Global error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: "File upload error: " + err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start the server
startServer();
