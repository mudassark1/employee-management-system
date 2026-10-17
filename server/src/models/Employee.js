import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    department: { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true },
    employmentType: { type: String, enum: ["Full-time", "Part-time", "Contract", "Intern"], default: "Full-time" },
    status: { type: String, enum: ["Active", "On leave", "Inactive"], default: "Active" },
    salary: { type: Number, min: 0, default: 0 },
    startDate: { type: Date, required: true },
    avatarColor: { type: String, default: "#e7eafe" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

employeeSchema.virtual("name").get(function getName() {
  return `${this.firstName} ${this.lastName}`;
});
employeeSchema.set("toJSON", { virtuals: true });
employeeSchema.set("toObject", { virtuals: true });

export default mongoose.model("Employee", employeeSchema);
