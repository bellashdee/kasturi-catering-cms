"use client";

import { StepGuideButton } from "@/components/shared/StepGuideButton";

const STEPS = [
  "Choose your name under Sales agent, then write the customer or company name.",
  "Write the Event name (for example: Annual Conference 2026) and choose the Event type.",
  "Write the Event location, then the PIC (the person in charge on the day) and the PIC contact number.",
  "Under Event days, fill in Day 1: the event date, the set-up time (when the kitchen must be ready to set up) and the event time (when the food must be ready).",
  "Choose the Meal type and the Service type, and write the Pax for that service. If two services are served, choose a Second service type and write its pax too.",
  "Under Menu details, write the menu one item at a time: press Enter for the next item, or paste a list. Write the Price per pax if you know it.",
  "If the event is more than one day, press + Add next day to copy the day before, then change what is different. Use Remove day for a day you do not need.",
  "Under What the customer needs, fill in only what the customer asked for (menu choices, food, special diets, equipment, serving, kitchen and catering set-up). Leave a box empty when it does not apply.",
  "Answer every Additional requirement: Yes (and the price if you know it), No, or Included in the food price.",
  "Add any Extra items to add to the quotation, write Anything else (remarks), and attach files (menu references, floor plans) if you have them.",
  "Check the Estimated total, then press Send quotation request. The office will check it and prepare the quotation. You can fill in another request straight away.",
];

/** The "Tutorial" button of the quotation request form: a step by step guide for the sales agent. */
export function QuotationFormTutorial() {
  return <StepGuideButton steps={STEPS} />;
}
