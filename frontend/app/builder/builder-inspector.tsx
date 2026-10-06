import { computedForType, fieldsForType, labelize, type FieldDef } from "./builder-graph";
import type { NodeType, LinkType, InputParams, ComputedValues, FieldValue, Measurement, CurvePoint } from "./builder-model";

// The inspector separates editable design inputs, optional field readings,
// and read-only simulation results for the selected graph element.
export function ElementForm(props: {
  elementId: string;
  label: string;
  type: NodeType | LinkType;
  params: InputParams;
  computed: ComputedValues;
  errors: Record<string, string>;
  showAllErrors: boolean;
  onRename: (value: string) => void;
  onParamChange: (key: string, value: FieldValue) => void;
  measurement?: Measurement | null;
  onMeasurementChange?: (value: number | null) => void;
}) {
  const fields = fieldsForType(props.type, props.params);
  return (
    <div className="space-y-4">
      <section className="builder-element-identity rounded border border-slate-200 bg-white p-4">
        <label className="text-xs font-medium text-slate-500">Label</label>
        <input
          value={props.label}
          onChange={(event) => props.onRename(event.target.value)}
          className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
        />
        <p className="mt-2 text-xs text-slate-500">{props.type}</p>
      </section>

      <section className="builder-input-parameters rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Input Parameters
          </h2>
        </div>
        <div className="space-y-3 p-4">
          {fields.map((field) => (
            <FieldControl
              key={field.key}
              elementId={props.elementId}
              field={field}
              value={props.params[field.key]}
              error={props.errors[`${props.elementId}.${field.key}`]}
              showAllErrors={props.showAllErrors}
              onChange={(value) => props.onParamChange(field.key, value)}
            />
          ))}
        </div>
      </section>

      {props.onMeasurementChange && (
        <section className="builder-field-measurement rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Field Measurement
            </h2>
          </div>
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">
                {props.type === "PIPE" || props.type === "PUMP" ||
                  props.type === "VALVE" || props.type === "FILTER"
                  ? "Flow rate (L/s)"
                  : "Pressure head (m)"}
              </span>
              <input
                type="number"
                value={props.measurement?.value ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  props.onMeasurementChange!(
                    value === "" ? null : Number(value),
                  );
                }}
                className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
              />
            </label>
          </div>
        </section>
      )}

      <section className="builder-computed-results rounded border border-slate-200 bg-slate-100">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Computed Results
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Read-only simulation outputs.
          </p>
        </div>
        <div className="space-y-2 p-4">
          {Object.keys(computedForType(props.type)).map((key) => {
            const value = props.computed[key];
            const display = value === null || value === undefined ? "Pending" : String(value);
            return (
              <div
                key={key}
                className="flex justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
              >
                <span className="font-medium text-slate-600">
                  {key === "energy" ? "Energy (kWh per 1 h)" : labelize(key)}
                </span>
                <span className={value === null || value === undefined ? "text-slate-400" : "text-slate-800"}>
                  {display}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FieldControl(props: {
  elementId: string;
  field: FieldDef;
  value: FieldValue;
  error?: string;
  showAllErrors: boolean;
  onChange: (value: FieldValue) => void;
}) {
  // Analysis reveals validation messages; drafts remain freely editable.
  const showError = props.error && props.showAllErrors;
  if (props.field.kind === "select") {
    return (
      <label className="block">
        <span className="text-xs font-medium text-slate-500">
          {props.field.label}
        </span>
        <select
          value={String(props.value ?? "")}
          onChange={(event) => props.onChange(event.target.value)}
          className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
        >
          <option value="">Select</option>
          {props.field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {showError && (
          <p className="mt-1 text-xs text-red-600">{props.error}</p>
        )}
      </label>
    );
  }
  if (props.field.kind === "curve") {
    const curveField = props.field;
    const yKey = curveField.yKey;
    const points = Array.isArray(props.value) ? props.value : [];
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {props.field.label}
          </span>
          <button
            type="button"
            onClick={() =>
              props.onChange([...points, { flow: "", [yKey]: "" }])
            }
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            Add row
          </button>
        </div>
        <div className="space-y-2">
          {points.map((point, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                placeholder="Flow"
                value={point.flow}
                onChange={(event) =>
                  props.onChange(
                    points.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, flow: event.target.value }
                        : item,
                    ),
                  )
                }
                className="h-8 rounded border border-slate-300 px-2 text-xs"
              />
              <input
                placeholder={yKey}
                value={point[yKey] ?? ""}
                onChange={(event) =>
                  props.onChange(
                    points.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, [yKey]: event.target.value }
                        : item,
                    ),
                  )
                }
                className="h-8 rounded border border-slate-300 px-2 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  props.onChange(
                    points.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                className="rounded border border-slate-300 px-2 text-xs"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <CurvePreview points={points} yKey={yKey} />
        {showError && (
          <p className="mt-1 text-xs text-red-600">{props.error}</p>
        )}
      </div>
    );
  }
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">
        {props.field.label}
        {props.field.unit ? ` (${props.field.unit})` : ""}
      </span>
      <input
        type={props.field.kind === "number" ? "number" : "text"}
        value={
          typeof props.value === "string" || typeof props.value === "number"
            ? props.value
            : ""
        }
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
      />
      {showError && <p className="mt-1 text-xs text-red-600">{props.error}</p>}
    </label>
  );
}

function CurvePreview({
  points,
  yKey,
}: {
  points: CurvePoint[];
  yKey: "head" | "headloss";
}) {
  const parsed = points
    .map((point) => ({ x: Number(point.flow), y: Number(point[yKey]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (parsed.length < 2)
    return (
      <div className="mt-2 h-20 rounded border border-dashed border-slate-300 bg-slate-50" />
    );
  const maxX = Math.max(...parsed.map((point) => point.x), 1);
  const maxY = Math.max(...parsed.map((point) => point.y), 1);
  const d = parsed
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${(point.x / maxX) * 140 + 10} ${70 - (point.y / maxY) * 60}`,
    )
    .join(" ");
  return (
    <svg className="mt-2 h-20 w-full rounded border border-slate-200 bg-slate-50">
      <path d={d} fill="none" stroke="#0f766e" strokeWidth="2" />
    </svg>
  );
}

export function EmptyProperties({ selectionCount }: { selectionCount: number }) {
  return (
    <section className="rounded border border-dashed border-slate-300 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Selection</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {selectionCount === 0
          ? "Select an element to edit its Section 3 input parameters."
          : "Multiple elements selected. Move, copy, delete, or use a single selection for properties."}
      </p>
    </section>
  );
}

