import React from "react";
import InfoTooltip from "./InfoTooltip";

interface FieldLabelProps {
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}

export default function FieldLabel({ htmlFor, hint, children }: FieldLabelProps) {
  return (
    <div className="field-label-row">
      <label htmlFor={htmlFor}>{children}</label>
      {hint && <InfoTooltip text={hint} />}
    </div>
  );
}
