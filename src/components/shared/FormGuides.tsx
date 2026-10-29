"use client";

import { StepGuideButton } from "@/components/shared/StepGuideButton";

/** The "Tutorial (step by step)" buttons of the forms. The steps are written in English; the pages translate them like all other text. */

const CUSTOMER_STEPS = [
  "Choose your name under Sales agent.",
  "Write the customer or company name (this one must be filled in).",
  "Write the contact person (PIC), the registration no. (SSM), the phone and the email, if you have them.",
  "Write the billing address and the delivery address.",
  "Write the area (for example the town) and any notes the office should know.",
  "Press Send customer details. The office checks them before the customer is added to the system.",
];

const EVENT_CLOCK_STEPS = [
  "Check the company, then choose your own name under Staff name.",
  "Write the Event location: the venue name and address.",
  "Choose Clock In when you arrive at the event, or Clock Out when you finish.",
  "Press the big button at the bottom to send it. When you finish, do it again and choose Clock Out.",
];

const LEAVE_STEPS = [
  "Choose the Leave type. If you choose Other, write what the leave is for.",
  "Choose the Start date and the End date.",
  "Write the Reason (optional).",
  "Attach the file: for medical leave upload the MC (Medical Certificate); for other leave the supporting file is optional.",
  "Press Submit for Approval. The admin approves or rejects it, and you can follow it under Leave in My Profile.",
];

const OVERTIME_STEPS = [
  "Choose your name under Select Staff Name. The company, department and position are filled in.",
  "Choose the OT date.",
  "Write the OT start time and the OT end time. The total OT hours are worked out for you.",
  "Write the reason or description of the work.",
  "Attach the manager's approval.",
  "Press Submit OT. Press Save Draft to keep it without sending. If the monthly OT limit is reached, it is sent as an OT Request that needs the manager's approval.",
];

const DELIVERY_STEPS = [
  "Choose the Company.",
  "Under Catering Event, choose the customer who ordered the event (or leave it not linked).",
  "Choose the Scheduled time and write the Location.",
  "Choose the Vehicle. If the delivery is by Lalamove or another vendor, choose it and attach the booking or receipt (optional).",
  "Write the Items to deliver and any notes.",
  "Press Create Delivery.",
];

export const CustomerFormGuide = () => <StepGuideButton steps={CUSTOMER_STEPS} />;
export const EventClockGuide = () => <StepGuideButton steps={EVENT_CLOCK_STEPS} />;
export const LeaveFormGuide = () => <StepGuideButton steps={LEAVE_STEPS} />;
export const OvertimeFormGuide = () => <StepGuideButton steps={OVERTIME_STEPS} />;
export const DeliveryFormGuide = () => <StepGuideButton steps={DELIVERY_STEPS} />;
