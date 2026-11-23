"use client";

import {
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
import AppFrame from "@/app/app/app-frame";
import BrandLogo from "@/app/brand-logo";
import {
  MAX_ARTWORK_FILE_BYTES,
  MAX_PRODUCTION_JOB_FLAG_REASON_LENGTH,
  PRODUCTION_WORKFLOW_STAGES,
} from "@/lib/production-data";
import type { ProductionWorkflowStage } from "@/lib/production-data";

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
  canManageOrganizations: boolean;
};

type DashboardView = "overview" | "jobs" | "origination" | "job-sheet" | ProductionWorkflowStage;

const STAGE_DETAILS: Record<ProductionWorkflowStage, string> = {
  "Order Booking": "Enter customer orders to start the production workflow",
  Origination: "Job details, customer requirements and carton specification",
  "Paper Booking": "Board specifications, material requirements and reel planning",
  "Board Production": "Converting, quality checks and board production tracking",
  Printing: "Print setup, artwork references and print instructions",
  Dispatch: "Packing, delivery details and final approvals",
};

const WORKSPACE_ITEMS: Array<{
  id: "overview" | "jobs" | "origination" | "job-sheet";
  label: string;
  icon: string;
}> = [
  { id: "overview", label: "Overview", icon: "O" },
  { id: "jobs", label: "All jobs", icon: "J" },
  { id: "origination", label: "Origination", icon: "A" },
  { id: "job-sheet", label: "Job sheet", icon: "+" },
];

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
        <span className="production-empty-mark" aria-hidden="true">J</span>
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
          <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
            <path d="M3 14V2m1 1h8L10.5 6 12 9H4" />
          </svg>
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
          + Add customer
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
              + Create item
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
              + Add customer
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
    () => new Set(
      organizations.filter((organization) => organization.role === "DESIGNER")
        .map((organization) => organization.id),
    ),
    [organizations],
  );
  const productionOrganizationIds = useMemo(
    () => new Set(
      organizations.filter((organization) => organization.role === "PRODUCTION")
        .map((organization) => organization.id),
    ),
    [organizations],
  );
  const orderBookingOrganizations = useMemo(
    () => organizations.filter((organization) => organization.role === "ORDER_BOOKER"),
    [organizations],
  );
  const canBookOrders = orderBookingOrganizations.some(
    (organization) => organizationFilter === "all" || organization.id === organizationFilter,
  );
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
  const canManageJobs = organizations.some(
    (organization) => organization.role === "PRODUCTION" &&
      (organizationFilter === "all" || organization.id === organizationFilter),
  );
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
          : view === "job-sheet" ? "Production job sheet"
            : view;
  const pageDescription =
    view === "overview" ? "Live snapshot of your shared production work."
      : view === "jobs" ? "Track and open jobs across your production organizations."
        : view === "origination" ? "Review planned jobs for your designer organizations and attach their artwork."
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
            .filter((item) => item.id !== "job-sheet" || canManageJobs)
            .map((item) => (
              <button
                aria-current={view === item.id ? "page" : undefined}
                className={`production-nav-item${view === item.id ? " is-active" : ""}`}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <span className="production-nav-icon" aria-hidden="true">{item.icon}</span>
                {item.label}
                {item.id === "jobs" && <span className="production-nav-count">{visibleJobs.length}</span>}
                {item.id === "origination" && (
                  <span className="production-nav-count">{originationJobs.length}</span>
                )}
              </button>
            ))}

          <p className="production-nav-label production-nav-workflow-label">WORKFLOW</p>
          {PRODUCTION_WORKFLOW_STAGES.map((stage, index) =>
            stage === "Origination" && designerOrganizationIds.size > 0 ? null : (
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
              <span className={`production-nav-stage stage-number-${index + 1}`} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              {stage}
              <span className="production-nav-count">
                {stageCounts.find((entry) => entry.stage === stage)?.count ?? 0}
              </span>
            </button>
          ))}
        </nav>

        <div className="production-sidebar-footer">
          {canManageOrganizations && (
            <Link className="production-footer-link" href="/admin/production">
              <span className="production-nav-icon" aria-hidden="true">O</span>
              Organization access
            </Link>
          )}
          <Link className="production-footer-link" href="/app">
            <span className="production-nav-icon" aria-hidden="true">S</span>
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
              <span aria-hidden="true">{isRefreshing ? "…" : "↻"}</span>
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
                      + Create product
                    </button>
                    <button
                      className="production-primary-button"
                      onClick={() => {
                        setCustomerCreationStatus("");
                        setIsCreatingCustomer(true);
                      }}
                      type="button"
                    >
                      + Create customer
                    </button>
                  </div>
                ) : view === "Order Booking" && canBookOrders ? (
                  <button
                    className="production-primary-button"
                    onClick={() => setIsBookingOrder(true)}
                    type="button"
                  >
                    + Book order
                  </button>
                ) : canManageJobs && view !== "overview" && view !== "origination" ? (
                  <button className="production-primary-button" onClick={openNewJobSheet} type="button">
                    + New job sheet
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
                      <span className="production-kpi-icon kpi-blue" aria-hidden="true">J</span>
                      <p>Jobs in register</p>
                      <strong>{visibleJobs.length}</strong>
                      <small>Across selected organizations</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-amber" aria-hidden="true">D</span>
                      <p>Due this week</p>
                      <strong>{dueThisWeek.length}</strong>
                      <small>Next 7 calendar days</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-red" aria-hidden="true">!</span>
                      <p>Past delivery date</p>
                      <strong>{overdueJobs.length}</strong>
                      <small>Shared jobs past due</small>
                    </article>
                    <article className="production-kpi-card">
                      <span className="production-kpi-icon kpi-green" aria-hidden="true">#</span>
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
