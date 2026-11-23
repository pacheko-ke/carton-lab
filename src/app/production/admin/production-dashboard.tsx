"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiBriefcase,
  FiCalendar,
  FiClipboard,
  FiFileText,
  FiFlag,
  FiGrid,
  FiLayers,
  FiLoader,
  FiPackage,
  FiPenTool,
  FiPlus,
  FiPrinter,
  FiRefreshCw,
  FiShoppingCart,
  FiTruck,
  FiUsers,
} from "react-icons/fi";
import AppFrame from "@/app/app/app-frame";
import BrandLogo from "@/app/brand-logo";
import {
  MAX_ARTWORK_FILE_BYTES,
  MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH,
  PRODUCTION_OPERATIONS,
  PRODUCTION_OPERATION_STATUSES,
  PRODUCTION_WORKFLOW_STAGES,
  isProductionOperation,
  isProductionOperationStatus,
} from "@/lib/production-data";
import type {
  ProductionOperation,
  ProductionOperationStatus,
  ProductionWorkflowStage,
} from "@/lib/production-data";
import {
  PRODUCTION_MATERIAL_CATEGORIES,
  PRODUCTION_MATERIAL_UNITS,
} from "@/lib/production-supply-data";

export type ProductionDashboardOrganization = {
  id: string;
  name: string;
  role: "PRODUCTION" | "DESIGNER" | "ORDER_BOOKER";
};

export type ProductionDashboardJob = {
  id: string;
  organizationId: string;
  organizationName: string;
  jobNo: string;
  jobName: string;
  customer: string;
  cartonSpec: string;
  size: string;
  flag: { reason: string } | null;
  deliveryDate: string;
  priority: string;
  orderQty: number | null;
  workflowStage: ProductionWorkflowStage;
  artworkCount: number;
  updatedAt: string;
};

export type ProductionDashboardSchedule = {
  id: string;
  organizationId: string;
  organizationName: string;
  jobId: string;
  jobNo: string;
  jobName: string;
  customer: string;
  operation: ProductionOperation;
  workCenter: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  plannedQty: number;
  status: ProductionOperationStatus;
  notes: string;
};

export type ProductionDashboardMaterial = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  reorderPoint: string;
  onHand: string;
  active: boolean;
};

export type ProductionDashboardSupplier = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
};

export type ProductionDashboardPurchaseOrderLine = {
  id: string;
  orderedQty: string;
  receivedQty: string;
  material: { id: string; code: string; name: string; unit: string };
};

export type ProductionDashboardPurchaseOrder = {
  id: string;
  organizationId: string;
  orderNo: string;
  status: string;
  expectedAt: string | null;
  notes: string;
  createdAt: string;
  supplier: { id: string; code: string; name: string };
  lines: ProductionDashboardPurchaseOrderLine[];
};

export type ProductionDashboardStockMovement = {
  id: string;
  organizationId: string;
  type: string;
  quantity: string;
  reference: string | null;
  notes: string;
  createdAt: string;
  material: { id: string; code: string; name: string; unit: string };
  jobId: string | null;
  jobNo: string;
};

type ProductionDashboardItem = {
  id: string;
  itemCode: string;
  customerId: string | null;
  name: string;
  boxType: string;
  topLiner: string;
  medium: string;
  bottomLiner: string;
  length: string;
  width: string;
  height: string;
  unit: "mm" | "in";
};

type ProductionDashboardCustomer = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type Props = {
  accountId: string;
  accountName: string;
  profile: {
    createdBy: string;
    companyName: string;
    role: string;
    contact: string;
    address: string;
  };
  profileQrCode: boolean[][];
  cartonTypes: string[];
  organizations: ProductionDashboardOrganization[];
  jobs: ProductionDashboardJob[];
  schedules: ProductionDashboardSchedule[];
  materials: ProductionDashboardMaterial[];
  suppliers: ProductionDashboardSupplier[];
  purchaseOrders: ProductionDashboardPurchaseOrder[];
  stockMovements: ProductionDashboardStockMovement[];
  isAdmin: boolean;
  canManageOrganizations: boolean;
};

type DashboardView =
  | "overview"
  | "jobs"
  | "origination"
  | "planning"
  | "procurement"
  | "inventory"
  | "job-sheet"
  | ProductionWorkflowStage;

const STAGE_DETAILS: Record<ProductionWorkflowStage | "planning" | "procurement" | "inventory", string> = {
  "Order Booking": "Enter customer orders to start the production workflow",
  Origination: "Job details, customer requirements and carton specification",
  "Paper Booking": "Board specifications, material requirements and reel planning",
  "Board Production": "Converting, quality checks and board production tracking",
  Printing: "Print setup, artwork references and print instructions",
  Dispatch: "Packing, delivery details and final approvals",
  planning: "Schedule production operations by work center and planned quantity",
  procurement: "Manage suppliers, material purchasing, and goods receipts",
  inventory: "Track material stock, job issues, and inventory adjustments",
};

const WORKSPACE_ITEMS: Array<{
  id: "overview" | "jobs" | "origination" | "planning" | "procurement" | "inventory" | "job-sheet";
  label: string;
  icon: IconType;
}> = [
  { id: "overview", label: "Overview", icon: FiGrid },
  { id: "jobs", label: "All jobs", icon: FiBriefcase },
  { id: "origination", label: "Origination", icon: FiPenTool },
  { id: "planning", label: "Planning & scheduling", icon: FiCalendar },
  { id: "procurement", label: "Procurement", icon: FiShoppingCart },
  { id: "inventory", label: "Inventory & WIP", icon: FiPackage },
  { id: "job-sheet", label: "Job sheet", icon: FiFileText },
];

const WORKFLOW_STAGE_ICONS: Record<ProductionWorkflowStage, IconType> = {
  "Order Booking": FiClipboard,
  Origination: FiPenTool,
  "Paper Booking": FiFileText,
  "Board Production": FiLayers,
  Printing: FiPrinter,
  Dispatch: FiTruck,
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
}

function formatDate(value: string) {
  if (!isValidDateKey(value)) return "Not scheduled";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function stageClass(stage: ProductionWorkflowStage) {
  return `production-stage-tag stage-${stage.toLowerCase().replaceAll(" ", "-")}`;
}

function JobTable({
  jobs,
  onOpen,
  onArtworkUploaded,
  onCreate,
  actionLabel = "Open",
  emptyHeading = "No shared jobs here yet",
  emptyDescription = "Create a job sheet or choose another organization or stage.",
  showArtwork = false,
  canOpenJobSheet = true,
  canOpenJobSheetForJob,
  canFlagJobs = false,
  canResolveJobFlag,
  onFlagChanged,
}: {
  jobs: ProductionDashboardJob[];
  onOpen: (job: ProductionDashboardJob) => void;
  onCreate?: () => void;
  canOpenJobSheet?: boolean;
  canOpenJobSheetForJob?: (job: ProductionDashboardJob) => boolean;
  actionLabel?: string;
  emptyHeading?: string;
  emptyDescription?: string;
  showArtwork?: boolean;
  onArtworkUploaded?: () => void;
  canFlagJobs?: boolean;
  canResolveJobFlag?: (job: ProductionDashboardJob) => boolean;
  onFlagChanged?: () => void;
}) {
  if (!jobs.length) {
    return (
      <div className="production-empty-state">
        <span className="production-empty-mark" aria-hidden="true"><FiBriefcase /></span>
        <h3>{emptyHeading}</h3>
        <p>{emptyDescription}</p>
        {onCreate && (
          <button className="production-primary-button" onClick={onCreate} type="button">
            Open job sheet
          </button>
        )}
      </div>
    );
  }

  const showJobSheetActions = canOpenJobSheet &&
    jobs.some((job) => canOpenJobSheetForJob?.(job) ?? true);

  return (
    <div className="production-table-scroll">
      <table className="production-jobs-table">
        <thead>
          <tr>
            <th scope="col">Job sheet no.</th>
            <th scope="col">Job</th>
            <th scope="col">Carton spec</th>
            <th scope="col">Size</th>
            <th scope="col">Customer</th>
            <th scope="col">Stage</th>
            <th scope="col">Flag / reason</th>
            {showArtwork && <th scope="col">Artwork</th>}
            <th scope="col">Delivery</th>
            <th scope="col" className="production-number-cell">Order qty</th>
            <th scope="col">Organization</th>
            {(showArtwork || showJobSheetActions) && (
              <th scope="col">
                {showArtwork ? "Attach artwork" : <span className="sr-only">Action</span>}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td><strong>{job.jobNo || "—"}</strong></td>
              <td>{job.jobName || "—"}</td>
              <td>{job.cartonSpec || "—"}</td>
              <td>{job.size || "—"}</td>
              <td>{job.customer || "—"}</td>
              <td><span className={stageClass(job.workflowStage)}>{job.workflowStage}</span></td>
              <td>
                <JobFlagControl
                  canFlag={canFlagJobs && job.workflowStage === "Origination"}
                  canResolve={canResolveJobFlag?.(job) ?? false}
                  job={job}
                  onChanged={onFlagChanged}
                />
              </td>
              {showArtwork && (
                <td>{job.artworkCount} file{job.artworkCount === 1 ? "" : "s"}</td>
              )}
              <td>{formatDate(job.deliveryDate)}</td>
              <td className="production-number-cell">
                {job.orderQty === null ? "—" : job.orderQty.toLocaleString("en-KE")}
              </td>
              <td>{job.organizationName}</td>
              {(showArtwork || showJobSheetActions) && (
                <td>
                  {showArtwork ? (
                    <ArtworkUploadButton job={job} onUploaded={onArtworkUploaded} />
                  ) : canOpenJobSheet && (canOpenJobSheetForJob?.(job) ?? true) ? (
                    <button
                      className="production-table-action"
                      onClick={() => onOpen(job)}
                      type="button"
                    >
                      {actionLabel}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductionDashboardItem(value: unknown): value is ProductionDashboardItem {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.itemCode === "string" &&
    (value.customerId === null || typeof value.customerId === "string") &&
    typeof value.name === "string" &&
    typeof value.boxType === "string" &&
    typeof value.topLiner === "string" &&
    typeof value.medium === "string" &&
    typeof value.bottomLiner === "string" &&
    typeof value.length === "string" &&
    typeof value.width === "string" &&
    typeof value.height === "string" &&
    (value.unit === "mm" || value.unit === "in");
}

function isProductionDashboardCustomer(value: unknown): value is ProductionDashboardCustomer {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.contactPerson === null || typeof value.contactPerson === "string") &&
    (value.phone === null || typeof value.phone === "string") &&
    (value.email === null || typeof value.email === "string") &&
    (value.address === null || typeof value.address === "string");
}

async function requestProductionJson(
  url: string,
  options: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(result) && typeof result.error === "string"
      ? result.error
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(result)) {
    throw new Error("The server returned an invalid response.");
  }
  return result;
}

type ProductionScheduleForm = {
  jobId: string;
  operation: ProductionOperation;
  workCenter: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  plannedQty: string;
  status: ProductionOperationStatus;
  notes: string;
};

function localDateTimeValue(value: Date) {
  const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function createProductionScheduleForm(jobId: string): ProductionScheduleForm {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    jobId,
    operation: PRODUCTION_OPERATIONS[0],
    workCenter: "",
    scheduledStartAt: localDateTimeValue(start),
    scheduledEndAt: localDateTimeValue(end),
    plannedQty: "",
    status: "PLANNED",
    notes: "",
  };
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function PlanningBoard({
  organizations,
  jobs,
  schedules,
  preferredOrganizationId,
  onSaved,
}: {
  organizations: ProductionDashboardOrganization[];
  jobs: ProductionDashboardJob[];
  schedules: ProductionDashboardSchedule[];
  preferredOrganizationId: string;
  onSaved: () => void;
}) {
  const productionOrganizations = organizations.filter(
    (organization) => organization.role === "PRODUCTION",
  );
  const [organizationId, setOrganizationId] = useState(preferredOrganizationId);
  const organizationJobs = jobs.filter((job) => job.organizationId === organizationId);
  const [form, setForm] = useState(() =>
    createProductionScheduleForm(organizationJobs[0]?.id ?? ""),
  );
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const organizationSchedules = schedules
    .filter((schedule) => schedule.organizationId === organizationId)
    .sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt));

  const updateOrganization = (nextOrganizationId: string) => {
    setOrganizationId(nextOrganizationId);
    setForm(createProductionScheduleForm(
      jobs.find((job) => job.organizationId === nextOrganizationId)?.id ?? "",
    ));
    setEditingScheduleId("");
    setStatus("");
  };

  const editSchedule = (schedule: ProductionDashboardSchedule) => {
    setOrganizationId(schedule.organizationId);
    setForm({
      jobId: schedule.jobId,
      operation: schedule.operation,
      workCenter: schedule.workCenter,
      scheduledStartAt: localDateTimeValue(new Date(schedule.scheduledStartAt)),
      scheduledEndAt: localDateTimeValue(new Date(schedule.scheduledEndAt)),
      plannedQty: String(schedule.plannedQty),
      status: schedule.status,
      notes: schedule.notes,
    });
    setEditingScheduleId(schedule.id);
    setStatus("");
  };

  const submitSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/operation-schedules`,
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            scheduledStartAt: new Date(form.scheduledStartAt).toISOString(),
            scheduledEndAt: new Date(form.scheduledEndAt).toISOString(),
          }),
        },
      );
      if (!isRecord(response.schedule)) {
        throw new Error("The server returned an invalid operation schedule.");
      }
      setStatus("Production schedule saved.");
      setForm(createProductionScheduleForm(organizationJobs[0]?.id ?? ""));
      setEditingScheduleId("");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">CAPACITY & SEQUENCING</span>
            <h2>{editingScheduleId ? "Update operation schedule" : "Schedule a job operation"}</h2>
          </div>
          <span className="production-panel-total">{organizationJobs.length} available jobs</span>
        </div>
        <form className="production-planning-form" onSubmit={submitSchedule}>
          {productionOrganizations.length > 1 && (
            <label className="production-order-booking-field">
              Production organization
              <select
                onChange={(event) => updateOrganization(event.target.value)}
                value={organizationId}
              >
                {productionOrganizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Job sheet
              <select
                disabled={Boolean(editingScheduleId)}
                onChange={(event) => setForm((current) => ({ ...current, jobId: event.target.value }))}
                required
                value={form.jobId}
              >
                <option value="">Select a job</option>
                {organizationJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNo || "Unnumbered"} — {job.jobName || job.customer || "Untitled job"}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              Operation
              <select
                disabled={Boolean(editingScheduleId)}
                onChange={(event) => {
                  const operation = event.currentTarget.value;
                  if (isProductionOperation(operation)) {
                    setForm((current) => ({ ...current, operation }));
                  }
                }}
                value={form.operation}
              >
                {PRODUCTION_OPERATIONS.map((operation) => (
                  <option key={operation} value={operation}>{operation}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Work center
              <input
                maxLength={80}
                onChange={(event) => setForm((current) => ({ ...current, workCenter: event.target.value }))}
                placeholder="e.g. Die cutter 1"
                required
                value={form.workCenter}
              />
            </label>
            <label className="production-order-booking-field">
              Planned quantity
              <input
                min="1"
                onChange={(event) => setForm((current) => ({ ...current, plannedQty: event.target.value }))}
                required
                type="number"
                value={form.plannedQty}
              />
            </label>
          </div>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Start
              <input
                onChange={(event) => setForm((current) => ({ ...current, scheduledStartAt: event.target.value }))}
                required
                type="datetime-local"
                value={form.scheduledStartAt}
              />
            </label>
            <label className="production-order-booking-field">
              End
              <input
                onChange={(event) => setForm((current) => ({ ...current, scheduledEndAt: event.target.value }))}
                required
                type="datetime-local"
                value={form.scheduledEndAt}
              />
            </label>
          </div>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Status
              <select
                onChange={(event) => {
                  const status = event.currentTarget.value;
                  if (isProductionOperationStatus(status)) {
                    setForm((current) => ({ ...current, status }));
                  }
                }}
                value={form.status}
              >
                {PRODUCTION_OPERATION_STATUSES.map((operationStatus) => (
                  <option key={operationStatus} value={operationStatus}>
                    {operationStatus.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-order-booking-field">
              Notes
              <input
                maxLength={500}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                value={form.notes}
              />
            </label>
          </div>
          {status && (
            <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
              {status}
            </p>
          )}
          {!organizationJobs.length && (
            <p className="production-chart-empty">Create or book a job in this production organization before scheduling an operation.</p>
          )}
          <div className="production-order-booking-actions">
            <button
              className="production-primary-button"
              disabled={isSaving || !organizationJobs.length}
              type="submit"
            >
              {isSaving ? "Saving…" : editingScheduleId ? "Update schedule" : "Schedule operation"}
            </button>
            {editingScheduleId && (
              <button
                className="production-text-action"
                onClick={() => {
                  setForm(createProductionScheduleForm(organizationJobs[0]?.id ?? ""));
                  setEditingScheduleId("");
                  setStatus("");
                }}
                type="button"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">WORK CENTER LOAD</span>
            <h2>Scheduled operations</h2>
          </div>
          <span className="production-panel-total">{organizationSchedules.length} operations</span>
        </div>
        {organizationSchedules.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table production-schedule-table">
              <thead>
                <tr>
                  <th scope="col">Job sheet</th>
                  {productionOrganizations.length > 1 && <th scope="col">Organization</th>}
                  <th scope="col">Operation</th>
                  <th scope="col">Work center</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                  <th scope="col">Planned qty</th>
                  <th scope="col">Status</th>
                  <th scope="col">Notes</th>
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {organizationSchedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>
                      <strong>{schedule.jobNo || "—"}</strong>
                      <small className="production-schedule-job-name">{schedule.jobName || schedule.customer}</small>
                    </td>
                    {productionOrganizations.length > 1 && <td>{schedule.organizationName}</td>}
                    <td>{schedule.operation}</td>
                    <td>{schedule.workCenter}</td>
                    <td>{formatScheduleDate(schedule.scheduledStartAt)}</td>
                    <td>{formatScheduleDate(schedule.scheduledEndAt)}</td>
                    <td>{schedule.plannedQty.toLocaleString("en-KE")}</td>
                    <td><span className={`production-schedule-status status-${schedule.status.toLowerCase()}`}>{schedule.status.replaceAll("_", " ")}</span></td>
                    <td className="production-schedule-notes">{schedule.notes || "—"}</td>
                    <td>
                      <button
                        className="production-table-action"
                        onClick={() => editSchedule(schedule)}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-empty-state">
            <span className="production-empty-mark" aria-hidden="true"><FiCalendar /></span>
            <h3>No operations scheduled</h3>
            <p>Schedule a job operation to see work center capacity and timing here.</p>
          </div>
        )}
      </section>
    </>
  );
}

function formatSupplyQuantity(value: string) {
  const quantity = Number(value);
  return Number.isFinite(quantity)
    ? quantity.toLocaleString("en-KE", { maximumFractionDigits: 3 })
    : value;
}

function ProcurementBoard({
  organizations,
  materials,
  suppliers,
  purchaseOrders,
  preferredOrganizationId,
  onSaved,
}: {
  organizations: ProductionDashboardOrganization[];
  materials: ProductionDashboardMaterial[];
  suppliers: ProductionDashboardSupplier[];
  purchaseOrders: ProductionDashboardPurchaseOrder[];
  preferredOrganizationId: string;
  onSaved: () => void;
}) {
  const [organizationId, setOrganizationId] = useState(preferredOrganizationId);
  const organizationMaterials = materials.filter((material) => material.organizationId === organizationId);
  const activeMaterials = organizationMaterials.filter((material) => material.active);
  const organizationSuppliers = suppliers.filter((supplier) => supplier.organizationId === organizationId);
  const activeSuppliers = organizationSuppliers.filter((supplier) => supplier.active);
  const organizationOrders = purchaseOrders.filter((order) => order.organizationId === organizationId);
  const [materialForm, setMaterialForm] = useState({
    name: "",
    category: "PAPER",
    unit: "kg",
    reorderPoint: "0",
  });
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderLines, setOrderLines] = useState<Array<{ materialId: string; quantity: string }>>([
    { materialId: "", quantity: "" },
  ]);
  const [receivingOrderId, setReceivingOrderId] = useState("");
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const changeOrganization = (nextOrganizationId: string) => {
    setOrganizationId(nextOrganizationId);
    setSelectedSupplierId("");
    setOrderLines([{ materialId: "", quantity: "" }]);
    setReceivingOrderId("");
    setReceiptQuantities({});
    setStatus("");
  };

  const createMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/materials`,
        { method: "POST", body: JSON.stringify(materialForm) },
      );
      if (!isRecord(response.material) || typeof response.material.code !== "string") {
        throw new Error("The server returned an invalid material.");
      }
      setMaterialForm({ name: "", category: "PAPER", unit: "kg", reorderPoint: "0" });
      setStatus(`Material created with code ${response.material.code}.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const createSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/suppliers`,
        { method: "POST", body: JSON.stringify(supplierForm) },
      );
      if (!isRecord(response.supplier) || typeof response.supplier.code !== "string") {
        throw new Error("The server returned an invalid supplier.");
      }
      setSupplierForm({ name: "", contactPerson: "", phone: "", email: "", address: "" });
      setStatus(`Supplier created with code ${response.supplier.code}.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const createPurchaseOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const response = await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/purchase-orders`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierId: selectedSupplierId,
            expectedAt,
            notes: orderNotes,
            lines: orderLines,
          }),
        },
      );
      if (!isRecord(response.purchaseOrder) || typeof response.purchaseOrder.orderNo !== "string") {
        throw new Error("The server returned an invalid purchase order.");
      }
      setSelectedSupplierId("");
      setExpectedAt("");
      setOrderNotes("");
      setOrderLines([{ materialId: activeMaterials[0]?.id ?? "", quantity: "" }]);
      setStatus(`Purchase order ${response.purchaseOrder.orderNo} created.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const openReceipt = (purchaseOrder: ProductionDashboardPurchaseOrder) => {
    setReceivingOrderId(purchaseOrder.id);
    setReceiptQuantities(Object.fromEntries(
      purchaseOrder.lines.map((line) => [line.id, ""]),
    ));
    setStatus("");
  };

  const receivePurchaseOrder = async (
    event: FormEvent<HTMLFormElement>,
    purchaseOrder: ProductionDashboardPurchaseOrder,
  ) => {
    event.preventDefault();
    const lines = Object.entries(receiptQuantities)
      .filter(([, quantity]) => quantity.trim())
      .map(([purchaseOrderLineId, quantity]) => ({ purchaseOrderLineId, quantity }));
    if (!lines.length) {
      setStatus("Enter a receipt quantity for at least one line.");
      setHasError(true);
      return;
    }
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/purchase-orders/${encodeURIComponent(purchaseOrder.id)}/receipts`,
        { method: "POST", body: JSON.stringify({ lines }) },
      );
      setReceivingOrderId("");
      setReceiptQuantities({});
      setStatus(`Goods received against ${purchaseOrder.orderNo}.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">SUPPLY SETUP</span>
            <h2>Materials and suppliers</h2>
          </div>
          {organizations.length > 1 && (
            <label className="production-organization-filter">
              <span>Organization</span>
              <select onChange={(event) => changeOrganization(event.target.value)} value={organizationId}>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="production-supply-setup-grid">
          <details className="production-supply-details">
            <summary>Add material</summary>
            <form className="production-supply-form" onSubmit={createMaterial}>
              <label className="production-order-booking-field">
                Material name
                <input maxLength={120} onChange={(event) => setMaterialForm((current) => ({ ...current, name: event.target.value }))} required value={materialForm.name} />
              </label>
              <div className="production-order-booking-row">
                <label className="production-order-booking-field">
                  Category
                  <select onChange={(event) => setMaterialForm((current) => ({ ...current, category: event.target.value }))} value={materialForm.category}>
                    {PRODUCTION_MATERIAL_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="production-order-booking-field">
                  Unit
                  <select onChange={(event) => setMaterialForm((current) => ({ ...current, unit: event.target.value }))} value={materialForm.unit}>
                    {PRODUCTION_MATERIAL_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </label>
              </div>
              <label className="production-order-booking-field">
                Reorder point ({materialForm.unit})
                <input min="0" onChange={(event) => setMaterialForm((current) => ({ ...current, reorderPoint: event.target.value }))} required step="0.001" type="number" value={materialForm.reorderPoint} />
              </label>
              <button className="production-primary-button" disabled={isSaving} type="submit">Save material</button>
            </form>
          </details>
          <details className="production-supply-details">
            <summary>Add supplier</summary>
            <form className="production-supply-form" onSubmit={createSupplier}>
              <label className="production-order-booking-field">
                Supplier name
                <input maxLength={120} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required value={supplierForm.name} />
              </label>
              <label className="production-order-booking-field">
                Contact person
                <input maxLength={120} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))} value={supplierForm.contactPerson} />
              </label>
              <div className="production-order-booking-row">
                <label className="production-order-booking-field">
                  Phone
                  <input maxLength={40} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} value={supplierForm.phone} />
                </label>
                <label className="production-order-booking-field">
                  Email
                  <input maxLength={254} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} type="email" value={supplierForm.email} />
                </label>
              </div>
              <label className="production-order-booking-field">
                Address
                <input maxLength={500} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} value={supplierForm.address} />
              </label>
              <button className="production-primary-button" disabled={isSaving} type="submit">Save supplier</button>
            </form>
          </details>
        </div>
        <div className="production-supply-register-grid">
          <div>
            <h3>Material register</h3>
            {organizationMaterials.length ? (
              <ul className="production-supply-compact-list">
                {organizationMaterials.map((material) => (
                  <li key={material.id}>
                    <span><strong>{material.code}</strong> {material.name}</span>
                    <small>{material.category} · {material.unit}{material.active ? "" : " · Inactive"}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="production-chart-empty">Add materials to begin purchasing stock.</p>}
          </div>
          <div>
            <h3>Supplier register</h3>
            {organizationSuppliers.length ? (
              <ul className="production-supply-compact-list">
                {organizationSuppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <span><strong>{supplier.code}</strong> {supplier.name}</span>
                    <small>{supplier.contactPerson || supplier.email || supplier.phone || (supplier.active ? "Active" : "Inactive")}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="production-chart-empty">Add suppliers to create purchase orders.</p>}
          </div>
        </div>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PROCUREMENT</span>
            <h2>Create purchase order</h2>
          </div>
          <span className="production-panel-total">{organizationOrders.length} purchase orders</span>
        </div>
        <form className="production-planning-form" onSubmit={createPurchaseOrder}>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Supplier
              <select onChange={(event) => setSelectedSupplierId(event.target.value)} required value={selectedSupplierId}>
                <option value="">Select a supplier</option>
                {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}
              </select>
            </label>
            <label className="production-order-booking-field">
              Expected delivery
              <input onChange={(event) => setExpectedAt(event.target.value)} type="date" value={expectedAt} />
            </label>
          </div>
          {orderLines.map((line, index) => (
            <div className="production-order-booking-row" key={`purchase-line-${index}`}>
              <label className="production-order-booking-field">
                Material
                <select
                  onChange={(event) => setOrderLines((current) => current.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, materialId: event.target.value } : entry,
                  ))}
                  required
                  value={line.materialId}
                >
                  <option value="">Select a material</option>
                  {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.code} — {material.name} ({material.unit})</option>)}
                </select>
              </label>
              <label className="production-order-booking-field">
                Order quantity
                <input min="0.001" onChange={(event) => setOrderLines((current) => current.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, quantity: event.target.value } : entry,
                ))} required step="0.001" type="number" value={line.quantity} />
              </label>
            </div>
          ))}
          <div className="production-supply-form-actions">
            <button className="production-text-action" disabled={orderLines.length >= 50} onClick={() => setOrderLines((current) => [...current, { materialId: "", quantity: "" }])} type="button"><FiPlus aria-hidden="true" /> Add material line</button>
            <button className="production-primary-button" disabled={isSaving || !activeMaterials.length || !activeSuppliers.length} type="submit">
              {isSaving ? "Saving…" : "Create purchase order"}
            </button>
          </div>
          <label className="production-order-booking-field">
            Notes
            <input maxLength={1000} onChange={(event) => setOrderNotes(event.target.value)} value={orderNotes} />
          </label>
          {status && <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>{status}</p>}
          {(!activeMaterials.length || !activeSuppliers.length) && (
            <p className="production-chart-empty">Add at least one active material and supplier before creating a purchase order.</p>
          )}
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">PURCHASE REGISTER</span>
            <h2>Purchase orders and receipts</h2>
          </div>
          <span className="production-panel-total">{organizationOrders.length} orders</span>
        </div>
        {organizationOrders.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Order</th><th scope="col">Supplier</th><th scope="col">Materials</th><th scope="col">Status</th><th scope="col">Expected</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {organizationOrders.map((purchaseOrder) => (
                  <Fragment key={purchaseOrder.id}>
                    <tr>
                      <td><strong>{purchaseOrder.orderNo}</strong></td>
                      <td>{purchaseOrder.supplier.name}</td>
                      <td className="production-schedule-notes">{purchaseOrder.lines.map((line) => `${line.material.name}: ${formatSupplyQuantity(line.receivedQty)}/${formatSupplyQuantity(line.orderedQty)} ${line.material.unit}`).join("; ")}</td>
                      <td><span className={`production-schedule-status status-${purchaseOrder.status.toLowerCase()}`}>{purchaseOrder.status.replaceAll("_", " ")}</span></td>
                      <td>{purchaseOrder.expectedAt ? formatDate(purchaseOrder.expectedAt.slice(0, 10)) : "—"}</td>
                      <td>
                        {purchaseOrder.status !== "RECEIVED" && purchaseOrder.status !== "CANCELLED" ? (
                          <button className="production-table-action" onClick={() => openReceipt(purchaseOrder)} type="button">
                            {purchaseOrder.status === "OPEN" ? "Receive goods" : "Receive more"}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                    {receivingOrderId === purchaseOrder.id && (
                      <tr>
                        <td colSpan={6}>
                          <form className="production-supply-receipt" onSubmit={(event) => receivePurchaseOrder(event, purchaseOrder)}>
                            <strong>Receive against {purchaseOrder.orderNo}</strong>
                            <div className="production-supply-receipt-lines">
                              {purchaseOrder.lines.map((line) => {
                                const outstanding = Math.max(0, Number(line.orderedQty) - Number(line.receivedQty));
                                return (
                                  <label className="production-order-booking-field" key={line.id}>
                                    {line.material.name} · {formatSupplyQuantity(line.receivedQty)}/{formatSupplyQuantity(line.orderedQty)} {line.material.unit}
                                    <input
                                      max={outstanding}
                                      min="0.001"
                                      onChange={(event) => setReceiptQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                                      placeholder={`Outstanding ${formatSupplyQuantity(String(outstanding))}`}
                                      required={false}
                                      step="0.001"
                                      type="number"
                                      value={receiptQuantities[line.id] ?? ""}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                            <div className="production-order-booking-actions">
                              <button className="production-primary-button" disabled={isSaving} type="submit">{isSaving ? "Receiving…" : "Post goods receipt"}</button>
                              <button className="production-text-action" onClick={() => setReceivingOrderId("")} type="button">Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="production-empty-state"><span className="production-empty-mark" aria-hidden="true"><FiShoppingCart /></span><h3>No purchase orders</h3><p>Create a purchase order to start tracking procurement and goods received.</p></div>}
      </section>
    </>
  );
}

function InventoryBoard({
  organizations,
  jobs,
  materials,
  stockMovements,
  preferredOrganizationId,
  onSaved,
}: {
  organizations: ProductionDashboardOrganization[];
  jobs: ProductionDashboardJob[];
  materials: ProductionDashboardMaterial[];
  stockMovements: ProductionDashboardStockMovement[];
  preferredOrganizationId: string;
  onSaved: () => void;
}) {
  const [organizationId, setOrganizationId] = useState(preferredOrganizationId);
  const organizationMaterials = materials.filter((material) => material.organizationId === organizationId);
  const activeMaterials = organizationMaterials.filter((material) => material.active);
  const organizationJobs = jobs.filter((job) => job.organizationId === organizationId);
  const organizationMovements = stockMovements.filter((movement) => movement.organizationId === organizationId);
  const wipMovements = organizationMovements.filter((movement) => movement.type === "ISSUE" && movement.jobId);
  const [type, setType] = useState<"ISSUE" | "ADJUSTMENT">("ISSUE");
  const [materialId, setMaterialId] = useState("");
  const [jobId, setJobId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const changeOrganization = (nextOrganizationId: string) => {
    setOrganizationId(nextOrganizationId);
    setMaterialId("");
    setJobId("");
    setQuantity("");
    setStatus("");
  };

  const postMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/inventory/movements`,
        {
          method: "POST",
          body: JSON.stringify({ type, materialId, jobId, quantity, notes }),
        },
      );
      setQuantity("");
      setNotes("");
      setStatus(type === "ISSUE" ? "Material issued to the job." : "Inventory adjustment posted.");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">RAW MATERIAL STOCK</span>
            <h2>Inventory on hand</h2>
          </div>
          {organizations.length > 1 && (
            <label className="production-organization-filter">
              <span>Organization</span>
              <select onChange={(event) => changeOrganization(event.target.value)} value={organizationId}>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {organizationMaterials.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Material</th><th scope="col">Category</th><th scope="col">On hand</th><th scope="col">Reorder point</th><th scope="col">Stock level</th></tr></thead>
              <tbody>
                {organizationMaterials.map((material) => {
                  const lowStock = material.active &&
                    Number(material.reorderPoint) > 0 &&
                    Number(material.onHand) <= Number(material.reorderPoint);
                  return (
                    <tr key={material.id}>
                      <td><strong>{material.code}</strong><small>{material.name}</small></td>
                      <td>{material.category}</td>
                      <td>{formatSupplyQuantity(material.onHand)} {material.unit}</td>
                      <td>{formatSupplyQuantity(material.reorderPoint)} {material.unit}</td>
                      <td>
                        <span className={`production-schedule-status${lowStock ? " status-on_hold" : material.active ? " status-completed" : ""}`}>
                          {!material.active ? "INACTIVE" : lowStock ? "REORDER" : "IN STOCK"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="production-empty-state"><span className="production-empty-mark" aria-hidden="true"><FiPackage /></span><h3>No materials registered</h3><p>Create materials and purchase orders in Procurement to start tracking stock.</p></div>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">STORE TRANSACTION</span>
            <h2>Issue to job or adjust stock</h2>
          </div>
        </div>
        <form className="production-planning-form" onSubmit={postMovement}>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Movement
              <select
                onChange={(event) => {
                  const movementType = event.currentTarget.value;
                  if (movementType === "ISSUE" || movementType === "ADJUSTMENT") {
                    setType(movementType);
                  }
                }}
                value={type}
              >
                <option value="ISSUE">Issue to job</option>
                <option value="ADJUSTMENT">Stock adjustment</option>
              </select>
            </label>
            <label className="production-order-booking-field">
              Material
              <select onChange={(event) => setMaterialId(event.target.value)} required value={materialId}>
                <option value="">Select a material</option>
                {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.code} — {material.name} ({material.unit})</option>)}
              </select>
            </label>
          </div>
          <div className="production-order-booking-row">
            {type === "ISSUE" && (
              <label className="production-order-booking-field">
                Job sheet
                <select onChange={(event) => setJobId(event.target.value)} required value={jobId}>
                  <option value="">Select a job</option>
                  {organizationJobs.map((job) => <option key={job.id} value={job.id}>{job.jobNo || "Unnumbered"} — {job.jobName || job.customer || "Untitled job"}</option>)}
                </select>
              </label>
            )}
            <label className="production-order-booking-field">
              {type === "ISSUE" ? `Quantity to issue (${activeMaterials.find((material) => material.id === materialId)?.unit ?? "unit"})` : "Adjustment (+/-)"}
              <input
                min={type === "ISSUE" ? "0.001" : undefined}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder={type === "ADJUSTMENT" ? "e.g. 10 or -2.5" : ""}
                required
                step="0.001"
                type="number"
                value={quantity}
              />
            </label>
          </div>
          <label className="production-order-booking-field">
            {type === "ADJUSTMENT" ? "Reason for adjustment" : "Notes"}
            <input maxLength={500} onChange={(event) => setNotes(event.target.value)} required={type === "ADJUSTMENT"} value={notes} />
          </label>
          {status && <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>{status}</p>}
          <div className="production-order-booking-actions">
            <button className="production-primary-button" disabled={isSaving || !activeMaterials.length || (type === "ISSUE" && !organizationJobs.length)} type="submit">
              {isSaving ? "Posting…" : type === "ISSUE" ? "Issue material to job" : "Post adjustment"}
            </button>
          </div>
        </form>
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">WORK IN PROGRESS</span>
            <h2>Materials issued to jobs</h2>
          </div>
          <span className="production-panel-total">{wipMovements.length} issues</span>
        </div>
        {wipMovements.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Job sheet</th><th scope="col">Material</th><th scope="col">Issued</th><th scope="col">Notes</th></tr></thead>
              <tbody>
                {wipMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatScheduleDate(movement.createdAt)}</td>
                    <td><strong>{movement.jobNo || "—"}</strong></td>
                    <td>{movement.material.code} — {movement.material.name}</td>
                    <td>{formatSupplyQuantity(String(Math.abs(Number(movement.quantity))))} {movement.material.unit}</td>
                    <td className="production-schedule-notes">{movement.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="production-chart-empty">Job-linked material issues will appear here as work moves into production.</p>}
      </section>

      <section className="production-panel production-list-panel">
        <div className="production-panel-heading">
          <div>
            <span className="production-panel-kicker">STOCK LEDGER</span>
            <h2>Recent material movements</h2>
          </div>
          <span className="production-panel-total">{organizationMovements.length} movements</span>
        </div>
        {organizationMovements.length ? (
          <div className="production-table-scroll">
            <table className="production-jobs-table">
              <thead><tr><th scope="col">Date</th><th scope="col">Movement</th><th scope="col">Material</th><th scope="col">Quantity</th><th scope="col">Reference</th><th scope="col">Notes</th></tr></thead>
              <tbody>
                {organizationMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatScheduleDate(movement.createdAt)}</td>
                    <td>{movement.type}</td>
                    <td>{movement.material.code} — {movement.material.name}</td>
                    <td>{formatSupplyQuantity(movement.quantity)} {movement.material.unit}</td>
                    <td>{movement.reference || movement.jobNo || "—"}</td>
                    <td className="production-schedule-notes">{movement.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="production-chart-empty">Receipts, job issues, and adjustments will appear in the ledger.</p>}
      </section>
    </>
  );
}

function JobFlagControl({
  job,
  canFlag,
  canResolve,
  onChanged,
}: {
  job: ProductionDashboardJob;
  canFlag: boolean;
  canResolve: boolean;
  onChanged?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isEditing && !dialog.open) {
      dialog.showModal();
      reasonInputRef.current?.focus();
    } else if (!isEditing && dialog.open) {
      dialog.close();
    }
  }, [isEditing]);

  const openFlagDialog = () => {
    setReason("");
    setStatus("");
    setHasError(false);
    setIsEditing(true);
  };

  const closeFlagDialog = () => {
    setIsEditing(false);
    setStatus("");
    setHasError(false);
  };

  const submitFlag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(`/api/production/jobs/${encodeURIComponent(job.id)}/flag`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setReason("");
      setIsEditing(false);
      setStatus("Job flagged.");
      onChanged?.();
    } catch (error) {
      console.error("Could not flag the production job:", error);
      setStatus(`Could not flag job: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const resolveFlag = async () => {
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      await requestProductionJson(`/api/production/jobs/${encodeURIComponent(job.id)}/flag`, {
        method: "PATCH",
      });
      setStatus("Job flag cleared.");
      onChanged?.();
    } catch (error) {
      console.error("Could not clear the production job flag:", error);
      setStatus(`Could not clear flag: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="production-job-flag">
      {job.flag ? (
        <>
          <strong>Flagged</strong>
          <small>{job.flag.reason}</small>
          {canResolve && (
            <button
              className="production-table-action"
              disabled={isSaving}
              onClick={resolveFlag}
              type="button"
            >
              {isSaving ? "Clearing…" : "Clear flag"}
            </button>
          )}
        </>
      ) : canFlag ? (
        <button
          aria-controls={`flag-dialog-${job.id}`}
          aria-haspopup="dialog"
          aria-label={`Flag job ${job.jobNo || ""}`.trim()}
          className="production-job-flag-trigger"
          onClick={openFlagDialog}
          title="Flag job"
          type="button"
        >
          <FiFlag aria-hidden="true" focusable="false" />
        </button>
      ) : (
        "—"
      )}
      {canFlag && (
        <dialog
          aria-labelledby={`flag-dialog-title-${job.id}`}
          className="production-flag-dialog"
          id={`flag-dialog-${job.id}`}
          onCancel={(event) => {
            event.preventDefault();
            closeFlagDialog();
          }}
          onClose={() => {
            if (isEditing) closeFlagDialog();
          }}
          ref={dialogRef}
        >
          <form onSubmit={submitFlag}>
            <div className="production-flag-dialog-heading">
              <span className="production-panel-kicker">JOB FLAG</span>
              <h2 id={`flag-dialog-title-${job.id}`}>Flag job</h2>
              <p>{[job.jobNo, job.jobName].filter(Boolean).join(" · ")}</p>
            </div>
            <label htmlFor={`flag-reason-${job.id}`}>Reason</label>
            <textarea
              ref={reasonInputRef}
              id={`flag-reason-${job.id}`}
              maxLength={MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH}
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Describe the issue with this job"
              required
              value={reason}
            />
            {status && (
              <small aria-live="polite" role={hasError ? "alert" : "status"}>
                {status}
              </small>
            )}
            <div className="production-flag-dialog-actions">
              <button className="production-primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Submitting…" : "Submit flag"}
              </button>
              <button
                className="production-text-action"
                disabled={isSaving}
                onClick={closeFlagDialog}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </dialog>
      )}
      {!isEditing && status && (
        <small aria-live="polite" role={hasError ? "alert" : "status"}>{status}</small>
      )}
    </div>
  );
}

function CreateProductionItemForm({
  organizationId,
  cartonTypes,
  title = "Create an item",
  onCreated,
  onCustomerCreated,
  onCancel,
}: {
  organizationId: string;
  cartonTypes: string[];
  title?: string;
  onCreated: (item: ProductionDashboardItem) => void;
  onCustomerCreated?: (customer: ProductionDashboardCustomer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [boxType, setBoxType] = useState("");
  const [customers, setCustomers] = useState<ProductionDashboardCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [topLiner, setTopLiner] = useState("");
  const [medium, setMedium] = useState("");
  const [bottomLiner, setBottomLiner] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState<"mm" | "in">("mm");
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    requestProductionJson(
      `/api/production/organizations/${encodeURIComponent(organizationId)}/customers`,
      { method: "GET" },
    )
      .then((result) => {
        if (!Array.isArray(result.customers) || !result.customers.every(isProductionDashboardCustomer)) {
          throw new Error("The server returned invalid customer details.");
        }
        if (active) setCustomers(result.customers);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load customers for the product:", error);
        setStatus(`Could not load customers: ${error instanceof Error ? error.message : String(error)}`);
        setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoadingCustomers(false);
      });

    return () => {
      active = false;
    };
  }, [organizationId]);

  const submitItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/items`,
        {
          method: "POST",
          body: JSON.stringify({
            customerId: selectedCustomerId,
            name,
            boxType,
            topLiner,
            medium,
            bottomLiner,
            length,
            width,
            height,
            unit,
          }),
        },
      );
      if (!isProductionDashboardItem(result.item)) {
        throw new Error("The server returned invalid item details.");
      }
      onCreated(result.item);
    } catch (error) {
      console.error("Could not create the production item:", error);
      setStatus(error instanceof Error ? error.message : String(error));
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (isCreatingCustomer) {
    return (
      <CreateProductionCustomerForm
        onCancel={() => setIsCreatingCustomer(false)}
        onCreated={(customer) => {
          setCustomers((current) =>
            [...current, customer].sort((left, right) => left.name.localeCompare(right.name)),
          );
          setSelectedCustomerId(customer.id);
          onCustomerCreated?.(customer);
          setIsCreatingCustomer(false);
          setStatus(`Customer ${customer.name} added and selected.`);
          setHasError(false);
        }}
        organizationId={organizationId}
      />
    );
  }

  return (
    <form className="production-item-create-form" onSubmit={submitItem}>
      <h3>{title}</h3>
      <div className="production-order-item-picker">
        <label className="production-order-booking-field" htmlFor="production-item-customer">
          Customer
          <select
            disabled={isLoadingCustomers}
            id="production-item-customer"
            onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}
            required
            value={selectedCustomerId}
          >
            <option value="">
              {isLoadingCustomers
                ? "Loading customers…"
                : customers.length
                  ? "Select a customer"
                  : "No customers yet"}
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}{customer.contactPerson ? ` — ${customer.contactPerson}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="production-text-action"
          disabled={isLoadingCustomers || isSaving}
          onClick={() => {
            setStatus("");
            setIsCreatingCustomer(true);
          }}
          type="button"
        >
          <FiPlus aria-hidden="true" /> Add customer
        </button>
      </div>
      <label className="production-order-booking-field">
        Item name
        <input
          maxLength={100}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          value={name}
        />
      </label>
      <label className="production-order-booking-field">
        Carton type
        <select
          onChange={(event) => setBoxType(event.currentTarget.value)}
          required
          value={boxType}
        >
          <option value="">Select a carton type</option>
          {cartonTypes.map((cartonType) => (
            <option key={cartonType} value={cartonType}>{cartonType}</option>
          ))}
        </select>
      </label>
      <div className="production-item-paper-row">
        <label className="production-order-booking-field">
          Top liner
          <input
            maxLength={60}
            onChange={(event) => setTopLiner(event.currentTarget.value)}
            placeholder="150k"
            required
            value={topLiner}
          />
        </label>
        <label className="production-order-booking-field">
          Medium
          <input
            maxLength={60}
            onChange={(event) => setMedium(event.currentTarget.value)}
            placeholder="150b"
            required
            value={medium}
          />
        </label>
        <label className="production-order-booking-field">
          Bottom liner
          <input
            maxLength={60}
            onChange={(event) => setBottomLiner(event.currentTarget.value)}
            placeholder="150c"
            required
            value={bottomLiner}
          />
        </label>
      </div>
      <div className="production-item-size-row">
        <label className="production-order-booking-field">
          Length
          <input
            min="0.001"
            onChange={(event) => setLength(event.currentTarget.value)}
            required
            step="any"
            type="number"
            value={length}
          />
        </label>
        <label className="production-order-booking-field">
          Width
          <input
            min="0.001"
            onChange={(event) => setWidth(event.currentTarget.value)}
            required
            step="any"
            type="number"
            value={width}
          />
        </label>
        <label className="production-order-booking-field">
          Height
          <input
            min="0.001"
            onChange={(event) => setHeight(event.currentTarget.value)}
            required
            step="any"
            type="number"
            value={height}
          />
        </label>
        <label className="production-order-booking-field">
          Unit
          <select
            onChange={(event) => {
              const nextUnit = event.currentTarget.value;
              if (nextUnit === "mm" || nextUnit === "in") setUnit(nextUnit);
            }}
            value={unit}
          >
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
        </label>
      </div>
      {status && (
        <p
          className={hasError ? "production-order-booking-error" : "production-order-booking-status"}
          role={hasError ? "alert" : "status"}
        >
          {status}
        </p>
      )}
      <div className="production-order-booking-actions">
        <button
          className="production-primary-button"
          disabled={isSaving || isLoadingCustomers}
          type="submit"
        >
          {isSaving ? "Saving…" : "Save item"}
        </button>
        <button className="production-text-action" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CreateProductionItemDialog({
  open,
  organizations,
  cartonTypes,
  defaultOrganizationId,
  onClose,
  onCreated,
}: {
  open: boolean;
  organizations: ProductionDashboardOrganization[];
  cartonTypes: string[];
  defaultOrganizationId: string;
  onClose: () => void;
  onCreated: (item: ProductionDashboardItem) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setOrganizationId(defaultOrganizationId);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [defaultOrganizationId, open]);

  return (
    <dialog
      aria-labelledby="production-create-product-title"
      className="production-order-booking-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      ref={dialogRef}
    >
      <div className="production-order-booking-content">
        <div className="production-order-booking-heading">
          <span className="production-panel-kicker">PRODUCT CATALOG</span>
          <h2 id="production-create-product-title">Create a product</h2>
          <p>Add a product to the selected organization catalog.</p>
        </div>
        {organizations.length > 1 && (
          <label className="production-order-booking-field">
            Organization
            <select
              onChange={(event) => setOrganizationId(event.currentTarget.value)}
              required
              value={organizationId}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <CreateProductionItemForm
          cartonTypes={cartonTypes}
          key={organizationId}
          onCancel={onClose}
          onCreated={onCreated}
          organizationId={organizationId}
          title="Product details"
        />
      </div>
    </dialog>
  );
}

function CreateProductionCustomerForm({
  organizationId,
  onCreated,
  onCancel,
}: {
  organizationId: string;
  onCreated: (customer: ProductionDashboardCustomer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");

  const submitCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    try {
      const result = await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/customers`,
        {
          method: "POST",
          body: JSON.stringify({ name, contactPerson, phone, email, address }),
        },
      );
      if (!isProductionDashboardCustomer(result.customer)) {
        throw new Error("The server returned invalid customer details.");
      }
      onCreated(result.customer);
    } catch (error) {
      console.error("Could not create the production customer:", error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="production-item-create-form" onSubmit={submitCustomer}>
      <h3>Add a customer</h3>
      <label className="production-order-booking-field">
        Customer name
        <input
          maxLength={120}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          value={name}
        />
      </label>
      <label className="production-order-booking-field">
        Contact person (optional)
        <input
          maxLength={120}
          onChange={(event) => setContactPerson(event.currentTarget.value)}
          value={contactPerson}
        />
      </label>
      <div className="production-customer-details-row">
        <label className="production-order-booking-field">
          Phone (optional)
          <input
            maxLength={40}
            onChange={(event) => setPhone(event.currentTarget.value)}
            type="tel"
            value={phone}
          />
        </label>
        <label className="production-order-booking-field">
          Email (optional)
          <input
            maxLength={254}
            onChange={(event) => setEmail(event.currentTarget.value)}
            type="email"
            value={email}
          />
        </label>
      </div>
      <label className="production-order-booking-field">
        Address (optional)
        <input
          maxLength={300}
          onChange={(event) => setAddress(event.currentTarget.value)}
          value={address}
        />
      </label>
      {status && <p className="production-order-booking-error" role="alert">{status}</p>}
      <div className="production-order-booking-actions">
        <button className="production-primary-button" disabled={isSaving} type="submit">
          {isSaving ? "Saving…" : "Save customer"}
        </button>
        <button className="production-text-action" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CreateProductionCustomerDialog({
  open,
  organizations,
  defaultOrganizationId,
  onClose,
  onCreated,
}: {
  open: boolean;
  organizations: ProductionDashboardOrganization[];
  defaultOrganizationId: string;
  onClose: () => void;
  onCreated: (customer: ProductionDashboardCustomer) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setOrganizationId(defaultOrganizationId);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [defaultOrganizationId, open]);

  return (
    <dialog
      aria-labelledby="production-create-customer-title"
      className="production-order-booking-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      ref={dialogRef}
    >
      <div className="production-order-booking-content">
        <div className="production-order-booking-heading">
          <span className="production-panel-kicker">CUSTOMER CATALOG</span>
          <h2 id="production-create-customer-title">Create a customer</h2>
          <p>Customer details are shared across organizations.</p>
        </div>
        {organizations.length > 1 && (
          <label className="production-order-booking-field">
            Organization
            <select
              onChange={(event) => setOrganizationId(event.currentTarget.value)}
              required
              value={organizationId}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <CreateProductionCustomerForm
          key={organizationId}
          onCancel={onClose}
          onCreated={onCreated}
          organizationId={organizationId}
        />
      </div>
    </dialog>
  );
}

function OrderBookingDialog({
  open,
  organizations,
  cartonTypes,
  defaultOrganizationId,
  onClose,
  onBooked,
}: {
  open: boolean;
  organizations: ProductionDashboardOrganization[];
  cartonTypes: string[];
  defaultOrganizationId: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itemSelectRef = useRef<HTMLSelectElement>(null);
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId);
  const [items, setItems] = useState<ProductionDashboardItem[]>([]);
  const [customers, setCustomers] = useState<ProductionDashboardCustomer[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerPO, setCustomerPO] = useState("");
  const [orderQty, setOrderQty] = useState("");
  const [orderDate, setOrderDate] = useState(() => dateKey(new Date()));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setOrganizationId(defaultOrganizationId);
      setItems([]);
      setCustomers([]);
      setSelectedItemId("");
      setSelectedCustomerId("");
      setCustomerPO("");
      setOrderQty("");
      setOrderDate(dateKey(new Date()));
      setDeliveryDate("");
      setIsCreatingItem(false);
      setIsCreatingCustomer(false);
      setIsLoadingItems(true);
      setIsLoadingCustomers(true);
      setStatus("");
      setHasError(false);
      dialog.showModal();
      itemSelectRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [defaultOrganizationId, open]);

  useEffect(() => {
    if (!open || !organizationId) return;

    let active = true;
    requestProductionJson(
      `/api/production/organizations/${encodeURIComponent(organizationId)}/items`,
      { method: "GET" },
    )
      .then((result) => {
        if (!Array.isArray(result.items) || !result.items.every(isProductionDashboardItem)) {
          throw new Error("The server returned invalid item details.");
        }
        if (active) setItems(result.items);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load production items:", error);
        setStatus(`Could not load items: ${error instanceof Error ? error.message : String(error)}`);
        setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoadingItems(false);
      });

    return () => {
      active = false;
    };
  }, [open, organizationId]);

  useEffect(() => {
    if (!open || !organizationId) return;

    let active = true;
    requestProductionJson(
      `/api/production/organizations/${encodeURIComponent(organizationId)}/customers`,
      { method: "GET" },
    )
      .then((result) => {
        if (!Array.isArray(result.customers) || !result.customers.every(isProductionDashboardCustomer)) {
          throw new Error("The server returned invalid customer details.");
        }
        if (active) setCustomers(result.customers);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load production customers:", error);
        setStatus(`Could not load customers: ${error instanceof Error ? error.message : String(error)}`);
        setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoadingCustomers(false);
      });

    return () => {
      active = false;
    };
  }, [open, organizationId]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("");
    setHasError(false);
    try {
      const result = await requestProductionJson(
        `/api/production/organizations/${encodeURIComponent(organizationId)}/order-bookings`,
        {
          method: "POST",
          body: JSON.stringify({
            itemId: selectedItemId,
            customerId: selectedCustomerId,
            customerPO,
            orderQty,
            orderDate,
            deliveryDate,
          }),
        },
      );
      const job = isRecord(result.job) ? result.job : null;
      const data = job && isRecord(job.data) ? job.data : null;
      const jobNo = data && typeof data.jobNo === "string" ? data.jobNo : "";
      setStatus(jobNo ? `Order ${jobNo} booked.` : "Order booked.");
      setSelectedCustomerId("");
      setCustomerPO("");
      setOrderQty("");
      setDeliveryDate("");
      onBooked();
    } catch (error) {
      console.error("Could not book the production order:", error);
      setStatus(`Could not book order: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog
      aria-labelledby="production-order-booking-title"
      className="production-order-booking-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      ref={dialogRef}
    >
      <div className="production-order-booking-content">
        <div className="production-order-booking-heading">
          <span className="production-panel-kicker">ORDER BOOKING</span>
          <h2 id="production-order-booking-title">Book a customer order</h2>
          <p>A job sheet number will be generated automatically.</p>
        </div>
        {organizations.length > 1 && (
          <label className="production-order-booking-field">
            Organization
            <select
              onChange={(event) => {
                setOrganizationId(event.currentTarget.value);
                setItems([]);
                setCustomers([]);
                setSelectedItemId("");
                setSelectedCustomerId("");
                setIsLoadingItems(true);
                setIsLoadingCustomers(true);
                setStatus("");
                setHasError(false);
              }}
              required
              value={organizationId}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {isCreatingItem ? (
          <CreateProductionItemForm
            cartonTypes={cartonTypes}
            onCustomerCreated={(customer) => {
              setCustomers((current) =>
                [...current, customer].sort((left, right) => left.name.localeCompare(right.name)),
              );
              setSelectedCustomerId(customer.id);
            }}
            onCancel={() => setIsCreatingItem(false)}
            onCreated={(item) => {
              setItems((current) =>
                [...current, item].sort((left, right) => left.itemCode.localeCompare(right.itemCode)),
              );
              setSelectedItemId(item.id);
              setSelectedCustomerId(item.customerId ?? "");
              setIsCreatingItem(false);
              setStatus(`Item ${item.itemCode} saved and selected.`);
              setHasError(false);
            }}
            organizationId={organizationId}
          />
        ) : isCreatingCustomer ? (
          <CreateProductionCustomerForm
            onCancel={() => setIsCreatingCustomer(false)}
            onCreated={(customer) => {
              setCustomers((current) =>
                [...current, customer].sort((left, right) => left.name.localeCompare(right.name)),
              );
              setSelectedCustomerId(customer.id);
              setIsCreatingCustomer(false);
              setStatus(`Customer ${customer.name} added and selected.`);
              setHasError(false);
            }}
            organizationId={organizationId}
          />
        ) : (
          <form className="production-order-booking-form" onSubmit={submitOrder}>
          <div className="production-order-item-picker">
            <label className="production-order-booking-field" htmlFor="production-order-item">
              Item
              <select
                id="production-order-item"
                onChange={(event) => {
                  const itemId = event.currentTarget.value;
                  const item = items.find((entry) => entry.id === itemId);
                  setSelectedItemId(itemId);
                  setSelectedCustomerId(item?.customerId ?? "");
                }}
                ref={itemSelectRef}
                required
                value={selectedItemId}
              >
                <option value="">
                  {isLoadingItems
                    ? "Loading items…"
                    : items.length
                      ? "Select an item"
                      : "No items yet"}
                </option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemCode} — {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="production-text-action"
              disabled={isLoadingItems || !organizationId}
              onClick={() => {
                setStatus("");
                setHasError(false);
                setIsCreatingItem(true);
              }}
              type="button"
            >
              <FiPlus aria-hidden="true" /> Create item
            </button>
          </div>
          {selectedItem && (
            <div className="production-order-item-summary">
              <strong>{selectedItem.itemCode} · {selectedItem.name}</strong>
              <span>{selectedItem.boxType}</span>
              <span>
                {selectedItem.topLiner}/{selectedItem.medium}/{selectedItem.bottomLiner}
              </span>
              <span>
                {selectedItem.length} × {selectedItem.width} × {selectedItem.height} {selectedItem.unit}
              </span>
            </div>
          )}
          <div className="production-order-item-picker">
            <label className="production-order-booking-field" htmlFor="production-order-customer">
              Customer
              <select
                id="production-order-customer"
                disabled={isLoadingCustomers}
                onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}
                required
                value={selectedCustomerId}
              >
                <option value="">
                  {isLoadingCustomers
                    ? "Loading customers…"
                    : customers.length
                      ? "Select a customer"
                      : "No customers yet"}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.contactPerson ? ` — ${customer.contactPerson}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="production-text-action"
              disabled={isLoadingCustomers || !organizationId}
              onClick={() => {
                setStatus("");
                setHasError(false);
                setIsCreatingCustomer(true);
              }}
              type="button"
            >
              <FiPlus aria-hidden="true" /> Add customer
            </button>
          </div>
          {selectedCustomer && (
            <div className="production-order-item-summary">
              <strong>{selectedCustomer.name}</strong>
              {selectedCustomer.contactPerson && <span>Contact: {selectedCustomer.contactPerson}</span>}
              {selectedCustomer.phone && <span>Phone: {selectedCustomer.phone}</span>}
              {selectedCustomer.email && <span>Email: {selectedCustomer.email}</span>}
              {selectedCustomer.address && <span>Address: {selectedCustomer.address}</span>}
            </div>
          )}
          <label className="production-order-booking-field">
            Customer PO number (optional)
            <input
              maxLength={60}
              onChange={(event) => setCustomerPO(event.currentTarget.value)}
              value={customerPO}
            />
          </label>
          <div className="production-order-booking-row">
            <label className="production-order-booking-field">
              Order quantity
              <input
                inputMode="numeric"
                min="1"
                onChange={(event) => setOrderQty(event.currentTarget.value)}
                required
                step="1"
                type="number"
                value={orderQty}
              />
            </label>
            <label className="production-order-booking-field">
              Order date
              <input
                onChange={(event) => setOrderDate(event.currentTarget.value)}
                required
                type="date"
                value={orderDate}
              />
            </label>
            <label className="production-order-booking-field">
              Delivery date
              <input
                onChange={(event) => setDeliveryDate(event.currentTarget.value)}
                required
                type="date"
                value={deliveryDate}
              />
            </label>
          </div>
          {status && (
            <p aria-live="polite" className={hasError ? "production-order-booking-error" : "production-order-booking-status"} role={hasError ? "alert" : "status"}>
              {status}
            </p>
          )}
          <div className="production-order-booking-actions">
            <button
              className="production-primary-button"
              disabled={isSaving || isLoadingItems || isLoadingCustomers}
              type="submit"
            >
              {isSaving ? "Booking…" : "Book order"}
            </button>
            <button
              className="production-text-action"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

function ArtworkUploadButton({
  job,
  onUploaded,
}: {
  job: ProductionDashboardJob;
  onUploaded?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  const uploadArtwork = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    if (file.size > MAX_ARTWORK_FILE_BYTES) {
      setStatus("Artwork files must be 5 MB or smaller.");
      setHasError(true);
      return;
    }

    setIsUploading(true);
    setStatus("Uploading artwork…");
    setHasError(false);
    try {
      const jobPath = `/api/production/jobs/${encodeURIComponent(job.id)}/artwork`;
      const upload = await requestProductionJson(`${jobPath}/upload-url`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      });
      if (
        typeof upload.pathname !== "string" ||
        typeof upload.presignedUrl !== "string" ||
        typeof upload.contentType !== "string"
      ) {
        throw new Error("The server returned an invalid artwork upload URL.");
      }

      const response = await fetch(upload.presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": upload.contentType },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Artwork upload failed (${response.status}).`);
      }

      await requestProductionJson(jobPath, {
        method: "POST",
        body: JSON.stringify({ pathname: upload.pathname, fileName: file.name }),
      });
      setStatus("Artwork attached.");
      onUploaded?.();
    } catch (error) {
      console.error("Could not attach artwork to the production job:", error);
      setStatus(`Could not attach artwork: ${error instanceof Error ? error.message : String(error)}`);
      setHasError(true);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="production-artwork-upload">
      <input
        ref={fileInputRef}
        accept=".ai,.cdr,.eps,.indd,.jpeg,.jpg,.pdf,.png,.ps,.psd,.svg,.tif,.tiff"
        aria-label={`Artwork file for ${job.jobNo || "untitled job"}`}
        className="sr-only"
        disabled={isUploading}
        onChange={uploadArtwork}
        type="file"
      />
      <button
        className="production-table-action"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        {isUploading ? "Uploading…" : "Attach artwork"}
      </button>
      {status && <small aria-live="polite" role={hasError ? "alert" : "status"}>{status}</small>}
    </div>
  );
}

export default function ProductionDashboard({
  accountId,
  accountName,
  profile,
  profileQrCode,
  cartonTypes,
  organizations,
  jobs,
  schedules,
  materials,
  suppliers,
  purchaseOrders,
  stockMovements,
  isAdmin,
  canManageOrganizations,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<DashboardView>("overview");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<ProductionDashboardJob | null>(null);
  const [isBookingOrder, setIsBookingOrder] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [productCreationStatus, setProductCreationStatus] = useState("");
  const [customerCreationStatus, setCustomerCreationStatus] = useState("");
  const [isRefreshing, startRefresh] = useTransition();
  const visibleJobs = useMemo(
    () => organizationFilter === "all"
      ? jobs
      : jobs.filter((job) => job.organizationId === organizationFilter),
    [jobs, organizationFilter],
  );
  const designerOrganizationIds = useMemo(
    () => new Set(isAdmin
      ? organizations.map((organization) => organization.id)
      : organizations.filter((organization) => organization.role === "DESIGNER")
        .map((organization) => organization.id)),
    [isAdmin, organizations],
  );
  const productionOrganizationIds = useMemo(
    () => new Set(isAdmin
      ? organizations.map((organization) => organization.id)
      : organizations.filter((organization) => organization.role === "PRODUCTION")
        .map((organization) => organization.id)),
    [isAdmin, organizations],
  );
  const orderBookingOrganizations = useMemo(
    () => isAdmin
      ? organizations.map((organization) => ({ ...organization, role: "ORDER_BOOKER" as const }))
      : organizations.filter((organization) => organization.role === "ORDER_BOOKER"),
    [isAdmin, organizations],
  );
  const canBookOrders = orderBookingOrganizations.some(
    (organization) => organizationFilter === "all" || organization.id === organizationFilter,
  ) || isAdmin;
  const defaultOrderBookingOrganizationId =
    orderBookingOrganizations.find((organization) => organization.id === organizationFilter)?.id ??
    orderBookingOrganizations[0]?.id ??
    "";
  const productOrganizations = organizationFilter === "all"
    ? orderBookingOrganizations
    : orderBookingOrganizations.filter((organization) => organization.id === organizationFilter);
  const originationJobs = useMemo(
    () => visibleJobs.filter(
      (job) => job.workflowStage === "Origination" &&
        designerOrganizationIds.has(job.organizationId),
    ),
    [visibleJobs, designerOrganizationIds],
  );
  const canManageJobs = isAdmin || organizations.some(
    (organization) => organization.role === "PRODUCTION" &&
      (organizationFilter === "all" || organization.id === organizationFilter),
  );
  const planningOrganizationId =
    organizations.find((organization) =>
      organization.role === "PRODUCTION" &&
      (organizationFilter === "all" || organization.id === organizationFilter),
    )?.id ??
    organizations.find((organization) => organization.role === "PRODUCTION")?.id ??
    "";
  const sheetOrganizationId = selectedJob?.organizationId ??
    (organizationFilter === "all"
      ? organizations.find((organization) => organization.role === "PRODUCTION")?.id
      : organizationFilter);
  const stageCounts = PRODUCTION_WORKFLOW_STAGES.map((stage) => ({
    stage,
    count: visibleJobs.filter((job) => job.workflowStage === stage).length,
  }));
  const stageOrderUnits = PRODUCTION_WORKFLOW_STAGES.map((stage) => ({
    stage,
    units: visibleJobs
      .filter((job) => job.workflowStage === stage)
      .reduce((total, job) => total + (job.orderQty ?? 0), 0),
  }));
  const maxStageOrderUnits = Math.max(1, ...stageOrderUnits.map(({ units }) => units));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndKey = dateKey(weekEnd);
  const overdueJobs = visibleJobs.filter(
    (job) =>
      isValidDateKey(job.deliveryDate) &&
      job.deliveryDate < todayKey,
  );
  const dueThisWeek = visibleJobs.filter(
    (job) =>
      isValidDateKey(job.deliveryDate) &&
      job.deliveryDate >= todayKey &&
      job.deliveryDate <= weekEndKey,
  );
  const orderUnits = visibleJobs.reduce((total, job) => total + (job.orderQty ?? 0), 0);
  const barMax = Math.max(1, ...stageCounts.map(({ count }) => count));
  const deliveryDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
      count: visibleJobs.filter((job) => job.deliveryDate === key).length,
    };
  });
  const deliveryMax = Math.max(1, ...deliveryDays.map(({ count }) => count));
  const pageTitle =
    view === "overview" ? "Production overview"
      : view === "jobs" ? "All production jobs"
        : view === "origination" ? "Origination"
          : view === "planning" ? "Production planning & scheduling"
            : view === "procurement" ? "Procurement"
              : view === "inventory" ? "Inventory & WIP"
          : view === "job-sheet" ? "Production job sheet"
            : view;
  const pageDescription =
    view === "overview" ? "Live snapshot of your shared production work."
      : view === "jobs" ? "Track and open jobs across your production organizations."
        : view === "origination" ? "Review planned jobs for your designer organizations and attach their artwork."
          : view === "planning" ? STAGE_DETAILS.planning
            : view === "procurement" ? STAGE_DETAILS.procurement
              : view === "inventory" ? STAGE_DETAILS.inventory
          : view === "job-sheet" ? "Create a local draft or work on an organization-shared job."
            : STAGE_DETAILS[view];

  const openJob = (job: ProductionDashboardJob) => {
    setSelectedJob(job);
    setView("job-sheet");
  };
  const openNewJobSheet = () => {
    setSelectedJob(null);
    setView("job-sheet");
  };

  return (
    <div className="production-dashboard-shell">
      <aside className="production-sidebar">
        <div className="production-brand">
          <div className="production-brand-lockup">
            <BrandLogo className="production-brand-wordmark" />
            <small>Production</small>
          </div>
        </div>

        <nav className="production-side-nav" aria-label="Production navigation">
          <p className="production-nav-label">WORKSPACE</p>
          {WORKSPACE_ITEMS
            .filter((item) => item.id !== "origination" || designerOrganizationIds.size > 0)
            .filter((item) =>
              (item.id !== "procurement" && item.id !== "inventory") ||
              productionOrganizationIds.size > 0,
            )
            .filter((item) => item.id !== "job-sheet" || canManageJobs)
            .map((item) => (
              <button
                aria-current={view === item.id ? "page" : undefined}
                className={`production-nav-item${view === item.id ? " is-active" : ""}`}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <span className="production-nav-icon" aria-hidden="true"><item.icon /></span>
                {item.label}
                {item.id === "jobs" && <span className="production-nav-count">{visibleJobs.length}</span>}
                {item.id === "origination" && (
                  <span className="production-nav-count">{originationJobs.length}</span>
                )}
              </button>
            ))}

          <p className="production-nav-label production-nav-workflow-label">WORKFLOW</p>
          {PRODUCTION_WORKFLOW_STAGES.map((stage) => {
            if (stage === "Origination" && designerOrganizationIds.size > 0) return null;
            const StageIcon = WORKFLOW_STAGE_ICONS[stage];

            return (
              <button
                aria-current={view === stage ? "page" : undefined}
                className={`production-nav-item${view === stage ? " is-active" : ""}`}
                key={stage}
                onClick={() => setView(
                  stage === "Origination" && designerOrganizationIds.size > 0
                    ? "origination"
                    : stage,
                )}
                type="button"
              >
                <span className="production-nav-stage" aria-hidden="true"><StageIcon /></span>
                {stage}
                <span className="production-nav-count">
                  {stageCounts.find((entry) => entry.stage === stage)?.count ?? 0}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="production-sidebar-footer">
          {canManageOrganizations && (
            <Link className="production-footer-link" href="/admin/production">
              <span className="production-nav-icon" aria-hidden="true"><FiUsers /></span>
              Organization access
            </Link>
          )}
          <Link className="production-footer-link" href="/app">
            <span className="production-nav-icon" aria-hidden="true"><FiArrowLeft /></span>
            Back to Studio
          </Link>
          <div className="production-user-card">
            <span className="production-user-avatar" aria-hidden="true">
              {accountName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{accountName}</strong>
              <small>
                {organizations.length
                  ? `${organizations.length} organization${organizations.length === 1 ? "" : "s"}`
                  : "No organization access"}
              </small>
            </span>
          </div>
        </div>
      </aside>

      <div className="production-dashboard-main">
        <header className="production-topbar">
          <div>
            <p className="production-breadcrumb">Production <span>/</span> {pageTitle}</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="production-topbar-actions">
            <label className="production-organization-filter">
              <span>Organization</span>
              <select
                aria-label="Filter dashboard by organization"
                onChange={(event) => {
                  setOrganizationFilter(event.target.value);
                  setSelectedJob(null);
                  setProductCreationStatus("");
                  setCustomerCreationStatus("");
                }}
                value={organizationFilter}
              >
                <option value="all">All organizations</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
            <button
              aria-label="Refresh dashboard data"
              className="production-refresh-button"
              disabled={isRefreshing}
              onClick={() => startRefresh(() => router.refresh())}
              type="button"
            >
              {isRefreshing ? (
                <FiLoader className="production-refresh-spinner" aria-hidden="true" />
              ) : (
                <FiRefreshCw aria-hidden="true" />
              )}
              Refresh
            </button>
          </div>
        </header>

        <main className={`production-dashboard-content${view === "job-sheet" ? " is-job-sheet-view" : ""}`}>
          {view === "job-sheet" ? (
            <div className="production-iframe-shell">
              <AppFrame
                key={`${sheetOrganizationId ?? organizationFilter}:${selectedJob?.id ?? "new"}`}
                accountId={accountId}
                profile={profile}
                profileQrCode={profileQrCode}
                workspace="production"
                organizationId={sheetOrganizationId}
                jobId={selectedJob?.id}
              />
            </div>
          ) : (
            <div className="production-page-content">
              <div className="production-page-intro">
                <p>{pageDescription}</p>
                {view === "overview" && canBookOrders ? (
                  <div className="production-dashboard-creation-actions">
                    <button
                      className="production-primary-button"
                      onClick={() => {
                        setProductCreationStatus("");
                        setIsCreatingProduct(true);
                      }}
                      type="button"
                    >
                      <FiPlus aria-hidden="true" /> Create product
                    </button>
                    <button
                      className="production-primary-button"
                      onClick={() => {
                        setCustomerCreationStatus("");
                        setIsCreatingCustomer(true);
                      }}
                      type="button"
                    >
                      <FiPlus aria-hidden="true" /> Create customer
                    </button>
                  </div>
                ) : view === "Order Booking" && canBookOrders ? (
                  <button
                    className="production-primary-button"
                    onClick={() => setIsBookingOrder(true)}
                    type="button"
                  >
                    <FiPlus aria-hidden="true" /> Book order
                  </button>
                ) : canManageJobs &&
                  view !== "overview" &&
                  view !== "origination" &&
                  view !== "planning" &&
                  view !== "procurement" &&
                  view !== "inventory" ? (
                  <button className="production-primary-button" onClick={openNewJobSheet} type="button">
                    <FiPlus aria-hidden="true" /> New job sheet
                  </button>
                ) : null}
              </div>
              {view === "overview" && productCreationStatus && (
                <p className="production-order-booking-status" role="status">
                  {productCreationStatus}
                </p>
              )}
              {view === "overview" && customerCreationStatus && (
                <p className="production-order-booking-status" role="status">
                  {customerCreationStatus}
                </p>
              )}

              {view === "overview" ? (
                <>
                  <section className="production-kpi-grid" aria-label="Production key performance indicators">
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-blue" aria-hidden="true"><FiBriefcase /></span>
                      <p>Jobs in register</p>
                      <strong>{visibleJobs.length}</strong>
                      <small>Across selected organizations</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-amber" aria-hidden="true"><FiCalendar /></span>
                      <p>Due this week</p>
                      <strong>{dueThisWeek.length}</strong>
                      <small>Next 7 calendar days</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-red" aria-hidden="true"><FiAlertTriangle /></span>
                      <p>Past delivery date</p>
                      <strong>{overdueJobs.length}</strong>
                      <small>Shared jobs past due</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-green" aria-hidden="true"><FiPackage /></span>
                      <p>Units on job register</p>
                      <strong>{orderUnits.toLocaleString("en-KE")}</strong>
                      <small>Total order quantities</small>
                    </article>
                  </section>

                  <section className="production-chart-grid" aria-label="Production visualizations">
                    <article className="production-panel">
                      <div className="production-panel-heading">
                        <div>
                          <span className="production-panel-kicker">WORK IN PROGRESS</span>
                          <h2>Jobs by workflow stage</h2>
                        </div>
                        <span className="production-panel-total">{visibleJobs.length} total</span>
                      </div>
                      <div className="production-stage-chart">
                        {stageCounts.map(({ stage, count }) => (
                          <button
                            className="production-stage-bar-row"
                            key={stage}
                            onClick={() => setView(stage)}
                            type="button"
                          >
                            <span>{stage}</span>
                            <span className="production-bar-track">
                              <span
                                className={`production-bar-fill stage-fill-${stage.toLowerCase().replaceAll(" ", "-")}`}
                                style={{ width: `${count ? Math.max(6, count / barMax * 100) : 0}%` }}
                              />
                            </span>
                            <strong>{count}</strong>
                          </button>
                        ))}
                      </div>
                      {!visibleJobs.length && (
                        <p className="production-chart-empty">Shared jobs will appear here as organizations create them.</p>
                      )}
                    </article>

                    <article className="production-panel">
                      <div className="production-panel-heading">
                        <div>
                          <span className="production-panel-kicker">DELIVERY SCHEDULE</span>
                          <h2>Due in the next 7 days</h2>
                        </div>
                        <span className="production-panel-total">{dueThisWeek.length} jobs</span>
                      </div>
                      <div
                        className="production-delivery-chart"
                        role="img"
                        aria-label={`Jobs due by day for the next seven days: ${deliveryDays.map((day) => `${day.label} ${day.count}`).join(", ")}`}
                      >
                        {deliveryDays.map((day) => (
                          <div className="production-delivery-day" key={day.key}>
                            <span className="production-delivery-value">{day.count || ""}</span>
                            <div className="production-delivery-track">
                              <span style={{ height: `${day.count ? Math.max(10, day.count / deliveryMax * 100) : 0}%` }} />
                            </div>
                            <span className="production-delivery-label">{day.label}</span>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="production-panel">
                      <div className="production-panel-heading">
                        <div>
                          <span className="production-panel-kicker">ORDER VOLUME</span>
                          <h2>Units by workflow stage</h2>
                        </div>
                        <span className="production-panel-total">{orderUnits.toLocaleString("en-KE")} units</span>
                      </div>
                      <div
                        aria-label={`Order units by workflow stage: ${stageOrderUnits.map(({ stage, units }) => `${stage} ${units}`).join(", ")}`}
                        className="production-volume-chart"
                        role="img"
                      >
                        {stageOrderUnits.map(({ stage, units }) => (
                          <div className="production-volume-row" key={stage}>
                            <span>{stage}</span>
                            <span className="production-bar-track">
                              <span
                                className={`production-bar-fill stage-fill-${stage.toLowerCase().replaceAll(" ", "-")}`}
                                style={{ width: `${units ? Math.max(3, units / maxStageOrderUnits * 100) : 0}%` }}
                              />
                            </span>
                            <strong>{units.toLocaleString("en-KE")}</strong>
                          </div>
                        ))}
                      </div>
                      {!orderUnits && (
                        <p className="production-chart-empty">Order quantities will appear here as jobs are added.</p>
                      )}
                    </article>
                  </section>

                  <section className="production-panel production-recent-panel">
                    <div className="production-panel-heading">
                      <div>
                        <span className="production-panel-kicker">LATEST UPDATES</span>
                        <h2>Recent production jobs</h2>
                      </div>
                      <button className="production-text-action" onClick={() => setView("jobs")} type="button">
                        View all jobs
                      </button>
                    </div>
                    <JobTable
                      jobs={visibleJobs.slice(0, 5)}
                      onOpen={openJob}
                      onCreate={canManageJobs ? openNewJobSheet : undefined}
                      canOpenJobSheet={canManageJobs}
                      canOpenJobSheetForJob={(job) => productionOrganizationIds.has(job.organizationId)}
                      canResolveJobFlag={(job) => productionOrganizationIds.has(job.organizationId)}
                      onFlagChanged={() => router.refresh()}
                    />
                  </section>
                </>
              ) : view === "origination" ? (
                <section className="production-panel production-list-panel">
                  <div className="production-panel-heading">
                    <div>
                      <span className="production-panel-kicker">ARTWORK QUEUE</span>
                      <h2>Planned jobs</h2>
                    </div>
                    <span className="production-panel-total">{originationJobs.length} jobs</span>
                  </div>
                  <JobTable
                    emptyDescription="Planned jobs for your designer organizations will appear here."
                    emptyHeading="No planned jobs"
                    jobs={originationJobs}
                    onOpen={openJob}
                    onArtworkUploaded={() => router.refresh()}
                    onFlagChanged={() => router.refresh()}
                    canFlagJobs
                    canResolveJobFlag={(job) => productionOrganizationIds.has(job.organizationId)}
                    showArtwork
                  />
                </section>
              ) : view === "planning" ? (
                productionOrganizationIds.size ? (
                  <PlanningBoard
                    key={planningOrganizationId}
                    jobs={jobs}
                    onSaved={() => router.refresh()}
                    organizations={organizations}
                    preferredOrganizationId={planningOrganizationId}
                    schedules={schedules}
                  />
                ) : (
                  <section className="production-panel production-list-panel">
                    <div className="production-panel-heading">
                      <div>
                        <span className="production-panel-kicker">CAPACITY & SEQUENCING</span>
                        <h2>Production access required</h2>
                      </div>
                    </div>
                    <p className="production-chart-empty">
                      Planning is available to members with Production access. Ask your organization administrator to update your access.
                    </p>
                  </section>
                )
              ) : view === "procurement" ? (
                <ProcurementBoard
                  key={planningOrganizationId}
                  materials={materials}
                  onSaved={() => router.refresh()}
                  organizations={organizations.filter((organization) => productionOrganizationIds.has(organization.id))}
                  preferredOrganizationId={planningOrganizationId}
                  purchaseOrders={purchaseOrders}
                  suppliers={suppliers}
                />
              ) : view === "inventory" ? (
                <InventoryBoard
                  key={planningOrganizationId}
                  jobs={jobs}
                  materials={materials}
                  onSaved={() => router.refresh()}
                  organizations={organizations.filter((organization) => productionOrganizationIds.has(organization.id))}
                  preferredOrganizationId={planningOrganizationId}
                  stockMovements={stockMovements}
                />
              ) : (
                <section className="production-panel production-list-panel">
                  <div className="production-panel-heading">
                    <div>
                      <span className="production-panel-kicker">
                        {view === "jobs" ? "SHARED JOB REGISTER" : "WORKFLOW QUEUE"}
                      </span>
                      <h2>{view === "jobs" ? "All production jobs" : `${view} queue`}</h2>
                    </div>
                    <span className="production-panel-total">
                      {view === "jobs"
                        ? visibleJobs.length
                        : visibleJobs.filter((job) => job.workflowStage === view).length} jobs
                    </span>
                  </div>
                  <JobTable
                    jobs={view === "jobs"
                      ? visibleJobs
                      : visibleJobs.filter((job) => job.workflowStage === view)}
                    onOpen={openJob}
                    onCreate={canManageJobs ? openNewJobSheet : undefined}
                    canOpenJobSheet={canManageJobs}
                    canOpenJobSheetForJob={(job) => productionOrganizationIds.has(job.organizationId)}
                    canResolveJobFlag={(job) => productionOrganizationIds.has(job.organizationId)}
                    onFlagChanged={() => router.refresh()}
                  />
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      <OrderBookingDialog
        cartonTypes={cartonTypes}
        defaultOrganizationId={defaultOrderBookingOrganizationId}
        onBooked={() => router.refresh()}
        onClose={() => setIsBookingOrder(false)}
        open={isBookingOrder}
        organizations={orderBookingOrganizations}
      />
      <CreateProductionItemDialog
        cartonTypes={cartonTypes}
        defaultOrganizationId={defaultOrderBookingOrganizationId}
        onClose={() => setIsCreatingProduct(false)}
        onCreated={(item) => {
          setProductCreationStatus(`${item.name} created with code ${item.itemCode}.`);
          setIsCreatingProduct(false);
          router.refresh();
        }}
        open={isCreatingProduct}
        organizations={productOrganizations}
      />
      <CreateProductionCustomerDialog
        defaultOrganizationId={defaultOrderBookingOrganizationId}
        onClose={() => setIsCreatingCustomer(false)}
        onCreated={(customer) => {
          setCustomerCreationStatus(`${customer.name} added to the shared catalog.`);
          setIsCreatingCustomer(false);
          router.refresh();
        }}
        open={isCreatingCustomer}
        organizations={productOrganizations}
      />
    </div>
  );
}
