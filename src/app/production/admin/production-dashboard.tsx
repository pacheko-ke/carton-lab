"use client";

import { useMemo, useRef, useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppFrame from "@/app/app/app-frame";
import BrandLogo from "@/app/brand-logo";
import { MAX_ARTWORK_FILE_BYTES, PRODUCTION_WORKFLOW_STAGES } from "@/lib/production-data";
import type { ProductionWorkflowStage } from "@/lib/production-data";

export type ProductionDashboardOrganization = {
  id: string;
  name: string;
  role: "PRODUCTION" | "DESIGNER";
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
  deliveryDate: string;
  priority: string;
  orderQty: number | null;
  workflowStage: ProductionWorkflowStage;
  artworkCount: number;
  updatedAt: string;
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
  organizations: ProductionDashboardOrganization[];
  jobs: ProductionDashboardJob[];
  canManageOrganizations: boolean;
};

type DashboardView = "overview" | "jobs" | "origination" | "job-sheet" | ProductionWorkflowStage;

const STAGE_DETAILS: Record<ProductionWorkflowStage, string> = {
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
}: {
  jobs: ProductionDashboardJob[];
  onOpen: (job: ProductionDashboardJob) => void;
  onCreate?: () => void;
  canOpenJobSheet?: boolean;
  actionLabel?: string;
  emptyHeading?: string;
  emptyDescription?: string;
  showArtwork?: boolean;
  onArtworkUploaded?: () => void;
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

  return (
    <div className="production-table-scroll">
      <table className="production-jobs-table">
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col">Carton spec</th>
            <th scope="col">Size</th>
            <th scope="col">Customer</th>
            <th scope="col">Stage</th>
            {showArtwork && <th scope="col">Artwork</th>}
            <th scope="col">Delivery</th>
            <th scope="col" className="production-number-cell">Order qty</th>
            <th scope="col">Organization</th>
            {(showArtwork || canOpenJobSheet) && (
              <th scope="col">
                {showArtwork ? "Attach artwork" : <span className="sr-only">Action</span>}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <strong>{job.jobNo || "Untitled job"}</strong>
                {job.jobName && <small>{job.jobName}</small>}
              </td>
              <td>{job.cartonSpec || "—"}</td>
              <td>{job.size || "—"}</td>
              <td>{job.customer || "—"}</td>
              <td><span className={stageClass(job.workflowStage)}>{job.workflowStage}</span></td>
              {showArtwork && (
                <td>{job.artworkCount} file{job.artworkCount === 1 ? "" : "s"}</td>
              )}
              <td>{formatDate(job.deliveryDate)}</td>
              <td className="production-number-cell">
                {job.orderQty === null ? "—" : job.orderQty.toLocaleString("en-KE")}
              </td>
              <td>{job.organizationName}</td>
              {(showArtwork || canOpenJobSheet) && (
                <td>
                  {showArtwork ? (
                    <ArtworkUploadButton job={job} onUploaded={onArtworkUploaded} />
                  ) : (
                    <button
                      className="production-table-action"
                      onClick={() => onOpen(job)}
                      type="button"
                    >
                      {actionLabel}
                    </button>
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
  organizations,
  jobs,
  canManageOrganizations,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<DashboardView>("overview");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<ProductionDashboardJob | null>(null);
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
                {canManageJobs && view !== "overview" && view !== "origination" && (
                  <button className="production-primary-button" onClick={openNewJobSheet} type="button">
                    + New job sheet
                  </button>
                )}
              </div>

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
                  />
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
