export type FieldType = "text" | "number" | "date" | "select" | "textarea";

export type FieldDef = {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

/** A generic "this looks like it might already exist" match, for the Duplicate Check step. */
export type DuplicateMatch = {
  id: string;
  label: string;
  meta?: string;
};
