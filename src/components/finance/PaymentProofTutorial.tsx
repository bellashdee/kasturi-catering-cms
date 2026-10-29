"use client";

import { StepGuideButton } from "@/components/shared/StepGuideButton";

const STEPS = [
  "Choose your name under Sales agent.",
  "Check the Payment date (it is today by default) and change it if the customer paid on another day.",
  "Choose the Payment method: how the customer paid.",
  "Write the Reference / receipt no. (the transfer reference, the cheque number or the receipt number).",
  "Write the Amount paid (RM) exactly as the customer paid it.",
  "Write the Customer invoice / order no. (the number on the customer's invoice or order).",
  "Under Remarks, choose Partial payment, Deposit or Full payment.",
  "Attach the photo or PDF of the receipt or proof of payment (optional, up to 10 MB).",
  "Press Send payment details. Our office will check them and record the payment. You can fill in another payment straight away.",
];

/** The "Tutorial" button of the customer payment details form. */
export function PaymentProofTutorial() {
  return <StepGuideButton steps={STEPS} />;
}
