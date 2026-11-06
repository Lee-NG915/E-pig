"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@e-pig/happy-dog/components/button";
import { Input } from "@e-pig/happy-dog/components/input";
import { getDefaultLocale, isMarketId } from "@/platform/config/markets";
import {
  getStorefrontQueryClient,
  type CartMarketIdentity,
} from "@/modules/cart/lib/cart-store";
import {
  ATTACHMENT_MEDIA_TYPES,
  AfterSalesClientError,
  MAX_ATTACHMENTS,
  MAX_DESCRIPTION_CODE_POINTS,
  afterSalesQueryBase,
  afterSalesRequestQueryKey,
  afterSalesTicketQueryKey,
  codePointLength,
  createAfterSalesRequest,
  getAfterSalesRequest,
  getAttachmentContent,
  getConsumerTicket,
  isAuthenticationFailure,
  isConflict,
  isDefinitelyNotWritten,
  isRateLimitedOrUnavailable,
  uploadAttachment,
  validateAttachmentFile,
  validateRequestBody,
  type AfterSalesAttachmentView,
  type AfterSalesRequestView,
  type AfterSalesTicketView,
  type RequestBody,
  type RequestType,
} from "./after-sales-client";
import {
  AfterSalesStorageError,
  assertRecoveryStorage,
  clearSubmission,
  confirmSubmission,
  createSubmission,
  isOpaqueAfterSalesId,
  readRecoveryState,
  recordRecoveredRequest,
  rememberSelectedRequest,
  type IndexedRequest,
  type PendingContext,
  type RequestIndex,
  type AfterSalesScope,
} from "./after-sales-storage";

const REQUEST_TYPES: Array<{ value: RequestType; label: string }> = [
  { value: "damaged", label: "The item arrived damaged" },
  { value: "wrong_item", label: "I received the wrong item" },
  { value: "return", label: "I want to return the item" },
  { value: "other", label: "Something else" },
];

const TICKET_STATUS_LABELS: Record<AfterSalesTicketView["status"], string> = {
  open: "Open",
  processing: "In progress",
  closed: "Closed",
};

function dateLocale(marketId: string): string {
  return isMarketId(marketId) ? getDefaultLocale(marketId) : "en-AU";
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value: number | string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function storageMessage(error: unknown): string {
  if (error instanceof AfterSalesStorageError) return error.message;
  return "This browser could not save or read your application safely. Sending is disabled in this tab.";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The after-sales request could not be completed. Please retry.";
}

function readRetryHint(error: unknown): string {
  if (error instanceof AfterSalesClientError) {
    if (error.retryable) return "This read can be retried.";
    if (error.recoveryAction === "LOOKUP_FIRST") {
      return "Keep the order details and contact customer support before retrying.";
    }
    return "Retrying this read is unlikely to change the result.";
  }
  return "Check your connection, then retry this read.";
}

function indexEntry(request: AfterSalesRequestView): IndexedRequest {
  return {
    request_id: request.request_id,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}

function requestMatchesOrder(
  request: AfterSalesRequestView,
  marketId: string,
  orderId: string,
): boolean {
  return request.order_id === orderId && request.market === marketId;
}

function ticketMatches(
  ticket: AfterSalesTicketView,
  request: AfterSalesRequestView,
  marketId: string,
  orderId: string,
): boolean {
  return (
    ticket.request_id === request.request_id &&
    ticket.order_id === orderId &&
    ticket.market === marketId
  );
}

type AttachmentTarget = {
  attachment_id: string;
  file_name: string;
  status?: "active" | "expired";
};

type Preview = {
  attachmentId: string;
  fileName: string;
  url: string;
};

export function AfterSalesPanel({
  market,
  cartId,
  orderId,
}: {
  market: CartMarketIdentity;
  cartId: string;
  orderId: string;
}) {
  const queryClient = getStorefrontQueryClient();
  const locale = dateLocale(market.id);
  const scope = useMemo<AfterSalesScope>(
    () => ({ market: market.id, cartId, orderId }),
    [market.id, cartId, orderId],
  );
  const fieldId = useId();
  const typeId = `${fieldId}-type`;
  const descriptionId = `${fieldId}-description`;
  const descriptionHelpId = `${fieldId}-description-help`;
  const descriptionErrorId = `${fieldId}-description-error`;
  const fileId = `${fieldId}-files`;
  const fileHelpId = `${fieldId}-files-help`;
  const fileErrorId = `${fieldId}-files-error`;
  const fileCountErrorId = `${fieldId}-files-count-error`;
  const requestSelectId = `${fieldId}-saved-requests`;
  const recoveryId = `${fieldId}-recovery`;
  const recoveryHelpId = `${fieldId}-recovery-help`;
  const recoveryErrorId = `${fieldId}-recovery-error`;

  const aliveRef = useRef(true);
  const submittingRef = useRef(false);
  const startingRef = useRef(false);
  const uploadingRef = useRef(false);
  const forbiddenRef = useRef(false);
  const generationRef = useRef(0);
  const autoReplayAttemptedRef = useRef(false);
  const abortControllersRef = useRef(new Set<AbortController>());
  const previewUrlRef = useRef<string | null>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recoveryRef = useRef<HTMLInputElement>(null);

  const [bootstrap, setBootstrap] = useState<
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [index, setIndex] = useState<RequestIndex | null>(null);
  const [pending, setPending] = useState<PendingContext | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [mismatchViewing, setMismatchViewing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [type, setType] = useState<RequestType | "">("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<AfterSalesAttachmentView[]>(
    [],
  );
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(
    null,
  );
  const [filesError, setFilesError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [recoveryInput, setRecoveryInput] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  const descriptionCount = codePointLength(description);
  const locked =
    pending !== null ||
    unknown ||
    conflict !== null ||
    forbidden ||
    submitting;

  const trackController = useCallback(() => {
    const controller = new AbortController();
    abortControllersRef.current.add(controller);
    return controller;
  }, []);

  const releaseController = useCallback((controller: AbortController) => {
    abortControllersRef.current.delete(controller);
  }, []);

  const operationIsStale = useCallback(
    (generation: number) =>
      !aliveRef.current ||
      forbiddenRef.current ||
      generation !== generationRef.current,
    [],
  );

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const controllers = abortControllersRef.current;
    return () => {
      aliveRef.current = false;
      for (const controller of controllers) {
        controller.abort();
      }
      controllers.clear();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const state = await readRecoveryState(scope);
        if (!active) return;
        if (
          state.pending &&
          state.marker &&
          (state.pending.idempotencyKey !== state.marker.idempotencyKey ||
            state.pending.requestHash !== state.marker.requestHash)
        ) {
          throw new AfterSalesStorageError(
            "corrupt",
            "Saved application details do not match. To avoid sending the same application twice, sending is disabled in this tab.",
          );
        }
        setIndex(state.index);
        setPending(state.pending);
        setUnknown(!state.pending && Boolean(state.marker));
        setMismatchViewing(false);
        const requestedSelection = state.index?.last_selected_id;
        setSelectedRequestId(
          requestedSelection &&
            state.index?.requests.some(
              (entry) => entry.request_id === requestedSelection,
            )
            ? requestedSelection
            : (state.index?.requests[0]?.request_id ?? null),
        );
        setBootstrap({ kind: "ready" });
      } catch (error) {
        if (!active) return;
        setBootstrap({ kind: "error", message: storageMessage(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [scope, bootstrapAttempt]);

  const baseKey = useMemo(
    () => afterSalesQueryBase(market.id, cartId, orderId),
    [market.id, cartId, orderId],
  );
  const requestQuery = useQuery(
    {
      queryKey: selectedRequestId
        ? afterSalesRequestQueryKey(
            market.id,
            cartId,
            orderId,
            selectedRequestId,
          )
        : [...baseKey, "request", "none"],
      queryFn: ({ signal }) =>
        getAfterSalesRequest(market.id, selectedRequestId ?? "", signal),
      enabled:
        Boolean(selectedRequestId) &&
        bootstrap.kind === "ready" &&
        !forbidden,
      retry: false,
      staleTime: 0,
    },
    queryClient,
  );

  const selectedRequest =
    requestQuery.data &&
    requestMatchesOrder(requestQuery.data, market.id, orderId)
      ? requestQuery.data
      : null;
  const requestMismatch = requestQuery.data
    ? !requestMatchesOrder(requestQuery.data, market.id, orderId)
    : false;
  const ticketId =
    selectedRequest?.status === "ticket_created"
      ? selectedRequest.ticket_id
      : null;

  const ticketQuery = useQuery(
    {
      queryKey: ticketId
        ? afterSalesTicketQueryKey(market.id, cartId, orderId, ticketId)
        : [...baseKey, "ticket", "none"],
      queryFn: ({ signal }) => getConsumerTicket(market.id, ticketId ?? "", signal),
      enabled:
        Boolean(ticketId) &&
        Boolean(selectedRequest) &&
        !forbidden,
      retry: false,
      staleTime: 0,
    },
    queryClient,
  );

  const selectedTicket =
    ticketQuery.data &&
    selectedRequest &&
    ticketMatches(ticketQuery.data, selectedRequest, market.id, orderId)
      ? ticketQuery.data
      : null;
  const ticketMismatch =
    ticketQuery.data && selectedRequest
      ? !ticketMatches(ticketQuery.data, selectedRequest, market.id, orderId)
      : false;
  const requestStale = Boolean(requestQuery.error && requestQuery.data);
  const ticketStale = Boolean(ticketQuery.error && ticketQuery.data);

  const handleForbidden = useCallback(() => {
    if (!aliveRef.current) return;
    forbiddenRef.current = true;
    generationRef.current += 1;
    for (const controller of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current.clear();
    setForbidden(true);
    setConflict(null);
    setPending(null);
    setUnknown(false);
    setMismatchViewing(false);
    setSelectedRequestId(null);
    setIndex(null);
    setType("");
    setDescription("");
    setAttachments([]);
    setFileErrors([]);
    setTypeError(null);
    setDescriptionError(null);
    setFilesError(null);
    setWriteError(null);
    setStorageWarning(null);
    setPreviewError(null);
    revokePreview();
    void queryClient
      .cancelQueries({ queryKey: baseKey })
      .catch(() => undefined);
    queryClient.removeQueries({ queryKey: baseKey });
  }, [baseKey, queryClient, revokePreview]);

  useEffect(() => {
    const error = requestQuery.error ?? ticketQuery.error;
    if (error && isAuthenticationFailure(error)) handleForbidden();
  }, [handleForbidden, requestQuery.error, ticketQuery.error]);

  const confirmCreatedRequest = useCallback(
    async (
      request: AfterSalesRequestView,
      context: PendingContext | null,
      generation: number,
    ) => {
      if (operationIsStale(generation)) return;
      setSelectedRequestId(request.request_id);
      queryClient.setQueryData(
        afterSalesRequestQueryKey(
          market.id,
          cartId,
          orderId,
          request.request_id,
        ),
        request,
      );
      setType("");
      setDescription("");
      setAttachments([]);
      setFileErrors([]);
      setTypeError(null);
      setDescriptionError(null);
      setFilesError(null);
      setConflict(null);
      setWriteError(null);
      setUnknown(false);
      setMismatchViewing(false);
      revokePreview();
      rememberSelectedRequest(scope, request.request_id);
      if (context) {
        try {
          const next = await confirmSubmission(scope, indexEntry(request));
          if (operationIsStale(generation)) return;
          setIndex(next);
          setPending(null);
          setStorageWarning(null);
        } catch (error) {
          if (operationIsStale(generation)) return;
          setPending(context);
          setStorageWarning(
            `Your application was received, but this browser could not save its application ID. Keep this ID: ${request.request_id}. Retrying will send the same application and will not create a second one. ${storageMessage(error)}`,
          );
        }
      }
    },
    [
      cartId,
      market.id,
      operationIsStale,
      orderId,
      queryClient,
      revokePreview,
      scope,
    ],
  );

  const replayPending = useCallback(
    async (context: PendingContext) => {
      if (
        submittingRef.current ||
        forbidden ||
        forbiddenRef.current ||
        !aliveRef.current
      ) {
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setWriteError(null);
      setConflict(null);
      const generation = generationRef.current;
      const controller = trackController();
      try {
        const result = await createAfterSalesRequest(
          market.id,
          context.body,
          context.idempotencyKey,
          controller.signal,
        );
        if (forbiddenRef.current || generation !== generationRef.current) {
          return;
        }
        if (!aliveRef.current) {
          await confirmSubmission(scope, indexEntry(result.request)).catch(
            () => undefined,
          );
          return;
        }
        await confirmCreatedRequest(result.request, context, generation);
      } catch (error) {
        if (operationIsStale(generation)) return;
        if (isAuthenticationFailure(error)) {
          handleForbidden();
          return;
        }
        setPending(context);
        if (isConflict(error)) {
          setConflict(
            "This application cannot be changed now. Keep this page open and contact customer support with your order and application number. Starting another application is blocked to avoid a duplicate.",
          );
          return;
        }
        if (isDefinitelyNotWritten(error)) {
          try {
            await clearSubmission(scope);
            if (operationIsStale(generation)) return;
            setPending(null);
            setConflict(null);
            setUnknown(false);
            setMismatchViewing(false);
            setStorageWarning(null);
            setWriteError(
              `${errorMessage(error)} The application was not created. You can correct the details and send a new application.`,
            );
          } catch (storageError) {
            if (operationIsStale(generation)) return;
            setPending(context);
            setStorageWarning(
              `The application was not created, but this browser could not clear the saved details. ${storageMessage(storageError)}`,
            );
          }
          return;
        }
        setWriteError(
          isRateLimitedOrUnavailable(error)
            ? "The after-sales service is busy or unavailable. Retry the saved application; it will not create a second one."
            : "We could not confirm whether the application was received. Retry the saved application; it will not create a second one.",
        );
      } finally {
        releaseController(controller);
        submittingRef.current = false;
        if (!operationIsStale(generation)) setSubmitting(false);
      }
    },
    [
      confirmCreatedRequest,
      forbidden,
      handleForbidden,
      market.id,
      operationIsStale,
      releaseController,
      scope,
      trackController,
    ],
  );

  useEffect(() => {
    if (
      bootstrap.kind !== "ready" ||
      !pending ||
      forbidden ||
      conflict ||
      autoReplayAttemptedRef.current
    ) {
      return;
    }
    autoReplayAttemptedRef.current = true;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    queueMicrotask(() => {
      void replayPending(pending);
    });
  }, [bootstrap.kind, conflict, forbidden, pending, replayPending]);

  function resetDraftErrors() {
    setTypeError(null);
    setDescriptionError(null);
    setFilesError(null);
    setFileErrors([]);
    setWriteError(null);
  }

  function cancelDraft() {
    if (pending || unknown || conflict || submitting) return;
    setType("");
    setDescription("");
    setAttachments([]);
    resetDraftErrors();
    setPreviewError(null);
    revokePreview();
  }

  function validateForm(): {
    message: string;
    focus: "type" | "description" | "files";
  } | null {
    if (!type) {
      setTypeError("Choose what went wrong with this order.");
      return { message: "Choose what went wrong with this order.", focus: "type" };
    }
    const trimmed = description.trim();
    if (!trimmed) {
      setDescriptionError("Describe the issue before sending.");
      return { message: "Describe the issue before sending.", focus: "description" };
    }
    if (codePointLength(description) > MAX_DESCRIPTION_CODE_POINTS) {
      setDescriptionError("Use 5000 characters or fewer.");
      return { message: "Use 5000 characters or fewer.", focus: "description" };
    }
    if (attachments.length > MAX_ATTACHMENTS) {
      setFilesError("Attach up to 3 photos.");
      return { message: "Attach up to 3 photos.", focus: "files" };
    }
    return null;
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      locked ||
      submittingRef.current ||
      startingRef.current ||
      uploadingFile ||
      forbiddenRef.current
    ) {
      return;
    }
    startingRef.current = true;
    autoReplayAttemptedRef.current = true;
    const generation = generationRef.current;
    try {
      resetDraftErrors();
      const problem = validateForm();
      if (problem) {
        if (problem.focus === "type") typeRef.current?.focus();
        if (problem.focus === "description") descriptionRef.current?.focus();
        if (problem.focus === "files") fileRef.current?.focus();
        return;
      }
      const body: RequestBody = {
        order_id: orderId,
        type: type as RequestType,
        description: description.trim(),
        attachment_ids: attachments.map((item) => item.attachment_id),
      };
      const bodyProblem = validateRequestBody(body);
      if (bodyProblem) {
        setWriteError(bodyProblem);
        descriptionRef.current?.focus();
        return;
      }
      if (!globalThis.crypto?.randomUUID) {
        setStorageWarning(
          "This browser cannot prepare a safe application. Sending is disabled in this tab.",
        );
        return;
      }
      setSubmitting(true);
      try {
        assertRecoveryStorage();
      } catch (error) {
        setStorageWarning(storageMessage(error));
        return;
      }
      let context: PendingContext;
      try {
        context = await createSubmission(
          scope,
          body,
          globalThis.crypto.randomUUID(),
          () => !operationIsStale(generation),
        );
      } catch (error) {
        if (operationIsStale(generation)) return;
        if (
          error instanceof AfterSalesStorageError &&
          error.reason === "already_pending"
        ) {
          setConflict(
            "This tab already has an application that has not been confirmed. Retry it before starting another one.",
          );
        } else {
          setStorageWarning(storageMessage(error));
        }
        return;
      }
      if (operationIsStale(generation)) return;
      setPending(context);
      await replayPending(context);
    } finally {
      startingRef.current = false;
      if (!operationIsStale(generation) && !submittingRef.current) {
        setSubmitting(false);
      }
    }
  }

  async function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || locked || uploadingRef.current || forbiddenRef.current) {
      return;
    }
    const generation = generationRef.current;
    uploadingRef.current = true;
    try {
      resetDraftErrors();
      try {
        assertRecoveryStorage();
      } catch (error) {
        setStorageWarning(storageMessage(error));
        return;
      }
      const errors: string[] = [];
      let remaining = MAX_ATTACHMENTS - attachments.length;
      for (const file of files) {
        if (remaining <= 0) {
          errors.push(`${file.name}: you can attach up to 3 photos.`);
          continue;
        }
        const problem = validateAttachmentFile(file);
        if (problem) {
          errors.push(problem);
          continue;
        }
        const controller = trackController();
        setUploadingFile(file.name);
        try {
          const uploaded = await uploadAttachment(
            market.id,
            orderId,
            file,
            controller.signal,
          );
          if (operationIsStale(generation)) return;
          setAttachments((current) =>
            current.some(
              (item) => item.attachment_id === uploaded.attachment_id,
            )
              ? current
              : [...current, uploaded].slice(0, MAX_ATTACHMENTS),
          );
          remaining -= 1;
        } catch (error) {
          if (operationIsStale(generation)) return;
          if (isAuthenticationFailure(error)) {
            handleForbidden();
            return;
          }
          errors.push(`${file.name}: ${errorMessage(error)}`);
        } finally {
          releaseController(controller);
          if (!operationIsStale(generation)) setUploadingFile(null);
        }
      }
      if (!operationIsStale(generation)) setFileErrors(errors);
    } finally {
      uploadingRef.current = false;
      if (!operationIsStale(generation)) setUploadingFile(null);
    }
  }

  async function openPreview(target: AttachmentTarget) {
    if (target.status === "expired") {
      setPreviewError("This photo has expired and can no longer be previewed.");
      return;
    }
    setPreviewError(null);
    const generation = generationRef.current;
    const controller = trackController();
    try {
      const content = await getAttachmentContent(
        market.id,
        target.attachment_id,
        controller.signal,
      );
      if (operationIsStale(generation)) return;
      const url = URL.createObjectURL(content.blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreview({
        attachmentId: target.attachment_id,
        fileName: target.file_name,
        url,
      });
    } catch (error) {
      if (operationIsStale(generation)) return;
      if (isAuthenticationFailure(error)) {
        handleForbidden();
        return;
      }
      setPreviewError(errorMessage(error));
    } finally {
      releaseController(controller);
    }
  }

  function removeAttachment(attachmentId: string) {
    if (locked) return;
    if (preview?.attachmentId === attachmentId) revokePreview();
    setAttachments((current) =>
      current.filter((item) => item.attachment_id !== attachmentId),
    );
  }

  function selectRequest(requestId: string) {
    setSelectedRequestId(requestId);
    setRecoveryError(null);
    setPreviewError(null);
    revokePreview();
    rememberSelectedRequest(scope, requestId);
  }

  async function recoverByRequestId(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (forbiddenRef.current) return;
    const requestId = recoveryInput.trim();
    if (!isOpaqueAfterSalesId(requestId)) {
      setRecoveryError("Enter a valid request ID from customer support.");
      recoveryRef.current?.focus();
      return;
    }
    setRecovering(true);
    setRecoveryError(null);
    setRecoveryNotice(null);
    const generation = generationRef.current;
    const controller = trackController();
    try {
      const request = await getAfterSalesRequest(
        market.id,
        requestId,
        controller.signal,
      );
      if (operationIsStale(generation)) return;
      if (!requestMatchesOrder(request, market.id, orderId)) {
        setRecoveryError(
          "That application does not belong to this order. Ask customer support to check the order and application number.",
        );
        return;
      }
      const { index: nextIndex, markerRemaining, markerWarning } =
        await recordRecoveredRequest(scope, request, () =>
          !operationIsStale(generation),
        );
      if (operationIsStale(generation)) return;
      setIndex(nextIndex);
      setPending(null);
      setConflict(null);
      setUnknown(markerRemaining);
      setMismatchViewing(markerRemaining);
      setSelectedRequestId(request.request_id);
      setPreviewError(null);
      revokePreview();
      rememberSelectedRequest(scope, request.request_id);
      queryClient.setQueryData(
        afterSalesRequestQueryKey(
          market.id,
          cartId,
          orderId,
          request.request_id,
        ),
        request,
      );
      setRecoveryInput("");
      setRecoveryNotice(
        markerRemaining
          ? markerWarning
            ? "Application found. An earlier submission still cannot be confirmed, and this browser could not update its saved status. Contact customer support before starting a new application."
            : "Application found. An earlier submission still cannot be confirmed, so starting a new application is blocked. Contact customer support before starting a new one."
          : "Application found. The details below come from customer support’s records.",
      );
    } catch (error) {
      if (operationIsStale(generation)) return;
      if (isAuthenticationFailure(error)) {
        handleForbidden();
        return;
      }
      setRecoveryError(
        `${errorMessage(error)} We cannot confirm whether other applications were submitted. Contact customer support if needed.`,
      );
    } finally {
      releaseController(controller);
      if (!operationIsStale(generation)) setRecovering(false);
    }
  }

  const requestStatus = selectedRequest?.status;
  const showEmpty =
    bootstrap.kind === "ready" &&
    !pending &&
    !unknown &&
    !conflict &&
    !forbidden &&
    (index?.requests.length ?? 0) === 0;
  const manualRecovery = (
    <form className="mt-5 space-y-3" onSubmit={recoverByRequestId}>
      <label className="block text-sm font-medium" htmlFor={recoveryId}>
        Have a request ID from customer support?
      </label>
      <p className="text-sm text-muted-foreground" id={recoveryHelpId}>
        This looks up an application saved for this order. It cannot show
        whether other applications were submitted.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={recoveryId}
          ref={recoveryRef}
          value={recoveryInput}
          onChange={(event) => setRecoveryInput(event.target.value)}
          placeholder="Request ID"
          autoComplete="off"
          aria-invalid={Boolean(recoveryError)}
          aria-describedby={[
            recoveryHelpId,
            recoveryError ? recoveryErrorId : null,
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={recovering || forbidden}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={recovering || forbidden}
        >
          {recovering ? "Looking up…" : "Find request"}
        </Button>
      </div>
      {recoveryError ? (
        <p className="text-sm text-destructive" id={recoveryErrorId} role="alert">
          {recoveryError}
        </p>
      ) : null}
      {recoveryNotice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {recoveryNotice}
        </p>
      ) : null}
    </form>
  );

  function attachmentList(
    items: AttachmentTarget[],
    options: { removable: boolean },
  ) {
    if (!items.length) return null;
    return (
      <ul className="mt-3 space-y-2">
        {items.map((attachment) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
            key={attachment.attachment_id}
          >
            <span className="min-w-0 break-all">
              {attachment.file_name}
              {attachment.status === "expired" ? " (expired)" : ""}
            </span>
            <span className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void openPreview(attachment)}
                disabled={attachment.status === "expired"}
              >
                Preview
              </Button>
              {options.removable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(attachment.attachment_id)}
                  disabled={locked}
                >
                  Remove
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (bootstrap.kind === "loading") {
    return (
      <section className="mt-8 rounded-xl border p-5 sm:p-8">
        <h2 className="font-display text-2xl">After-sales support</h2>
        <p className="mt-3" role="status">
          Loading saved after-sales details…
        </p>
      </section>
    );
  }

  if (bootstrap.kind === "error") {
    return (
      <section className="mt-8 rounded-xl border p-5 sm:p-8">
        <h2 className="font-display text-2xl">After-sales support</h2>
        <div className="mt-3 rounded-lg border p-4" role="alert">
          <p>{bootstrap.message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            For your safety, reading is blocked so a saved application cannot
            be hidden or sent twice.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              setBootstrap({ kind: "loading" });
              setStorageWarning(null);
              setWriteError(null);
              setConflict(null);
              setUnknown(false);
              setRecovering(false);
              setRecoveryError(null);
              setRecoveryNotice(null);
              setBootstrapAttempt((value) => value + 1);
            }}
          >
            Try reading again
          </Button>
        </div>
      </section>
    );
  }

  if (forbidden) {
    return (
      <section className="mt-8 rounded-xl border p-5 sm:p-8">
        <h2 className="font-display text-2xl">After-sales support</h2>
        <div className="mt-3 rounded-lg border border-destructive/40 p-4" role="alert">
          <p>
            You no longer have access to this order’s after-sales details.
            Cached request text and replies have been cleared.
          </p>
          <Link
            className="mt-3 inline-block underline underline-offset-4"
            href={`/${market.id}/orders`}
          >
            Return to your orders
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 min-w-0 rounded-xl border p-5 sm:p-8">
      <h2 className="font-display text-2xl">After-sales support</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Tell us what went wrong and attach up to three photos. You will see the
        single final reply here when customer support has answered.
      </p>

      {storageWarning ? (
        <p className="mt-4 rounded-lg border p-4 text-sm" role="alert">
          {storageWarning}
        </p>
      ) : null}

      {unknown ? (
        <div className="mt-4 rounded-lg border border-amber-500/40 p-4" role="alert">
          <p className="font-medium">
            The result of an earlier application is unknown.
          </p>
          <p className="mt-2 text-sm">
            This tab no longer has the details of an earlier application, but it
            may already have been sent. To avoid sending it twice, starting
            another application here is blocked. If you have an application
            number from customer support, enter it below, or contact customer
            support.
          </p>
        </div>
      ) : null}

      {conflict ? (
        <div className="mt-4 rounded-lg border border-destructive/40 p-4" role="alert">
          <p className="font-medium">This application is locked.</p>
          <p className="mt-2 text-sm">{conflict}</p>
        </div>
      ) : null}

      {pending ? (
        <div className="mt-4 rounded-lg border p-4" aria-label="Saved request recovery">
          <p className="font-medium">
            An unconfirmed application is saved in this tab.
          </p>
          <p className="mt-2 text-sm">
            Retrying sends the same application and details, so it cannot create
            a second one. Editing is locked until this is confirmed.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Saved in this tab at{" "}
            {formatDateTime(pending.createdAt, locale)}. No password or payment
            details are stored. Clearing browser data or switching devices means
            it cannot be retried here.
          </p>
          {submitting ? (
            <p className="mt-2 text-sm" role="status">
              Retrying the saved application…
            </p>
          ) : null}
          {writeError ? (
            <p className="mt-2 text-sm" role="alert">
              {writeError}
            </p>
          ) : null}
          <Button
            className="mt-4"
            variant="outline"
            disabled={submitting}
            onClick={() => {
              if (pending) void replayPending(pending);
            }}
          >
            Retry saved application
          </Button>
        </div>
      ) : null}

      {!pending &&
      !conflict &&
      (!unknown || mismatchViewing) &&
      index?.requests.length ? (
        <div className="mt-5">
          <label className="block text-sm font-medium" htmlFor={requestSelectId}>
            Saved requests in this browser
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            This browser only stores application IDs and times. Customer
            support’s records decide what this order can see.
          </p>
          <select
            id={requestSelectId}
            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
            value={selectedRequestId ?? ""}
            onChange={(event) => selectRequest(event.target.value)}
            disabled={submitting}
          >
            {index.requests.map((entry) => (
              <option key={entry.request_id} value={entry.request_id}>
                Request {entry.request_id} · updated{" "}
                {formatDate(entry.updated_at, locale)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!conflict && (!unknown || mismatchViewing) && selectedRequestId ? (
        <article className="mt-5 min-w-0 rounded-lg border p-4 sm:p-5">
          {requestQuery.isPending ? (
            <p role="status">Loading the saved request…</p>
          ) : null}
          {requestQuery.isError && !selectedRequest ? (
            <div role="alert">
              <p>
                This browser’s saved request could not be read. It may belong to
                another browser or no longer be accessible. This does not
                confirm whether a request was submitted for this order.
              </p>
              <p className="mt-2 text-sm">{errorMessage(requestQuery.error)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {readRetryHint(requestQuery.error)}
              </p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => void requestQuery.refetch()}
              >
                Try reading again
              </Button>
            </div>
          ) : null}
          {requestMismatch ? (
            <p role="alert">
              The saved request does not match this order. It was not shown.
            </p>
          ) : null}
          {selectedRequest ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Request
                  </p>
                  <h3 className="mt-1 break-all text-lg font-medium">
                    {selectedRequest.request_id}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Updated{" "}
                    {formatDateTime(selectedRequest.updated_at, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="rounded-full border px-3 py-1 text-sm">
                    {requestStatus === "ticket_created"
                      ? "Reply received"
                      : "Received — awaiting reply"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={requestQuery.isFetching}
                    onClick={() => void requestQuery.refetch()}
                  >
                    Refresh request
                  </Button>
                </div>
              </div>

              {requestStale ? (
                <div className="mt-4 rounded-lg border border-amber-500/40 p-3 text-sm" role="alert">
                  <p>
                    This is the last confirmed read from{" "}
                    {formatDateTime(requestQuery.dataUpdatedAt, locale)}. A
                    refresh failed, so this may not be the latest status.
                  </p>
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    onClick={() => void requestQuery.refetch()}
                  >
                    Refresh request
                  </Button>
                </div>
              ) : null}

              <p className="mt-4 break-words text-sm leading-6">
                {selectedRequest.description}
              </p>
              {attachmentList(selectedRequest.attachments, {
                removable: false,
              })}
            </>
          ) : null}

          {selectedRequest?.status === "ticket_created" ? (
            <div className="mt-5 border-t pt-4">
              {ticketQuery.isPending ? (
                <p role="status">Loading the final reply…</p>
              ) : null}
              {ticketQuery.isError && !selectedTicket ? (
                <div role="alert">
                  <p>The final reply could not be read. Please retry.</p>
                  <p className="mt-2 text-sm">{errorMessage(ticketQuery.error)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {readRetryHint(ticketQuery.error)}
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={() => void ticketQuery.refetch()}
                  >
                    Retry reply
                  </Button>
                </div>
              ) : null}
              {ticketMismatch ? (
                <p className="mb-3 text-sm" role="alert">
                  The saved reply does not match this request or order. It was
                  not shown.
                </p>
              ) : null}
              {ticketStale ? (
                <div className="mb-3 rounded-lg border border-amber-500/40 p-3 text-sm" role="alert">
                  <p>
                    Showing the last confirmed reply from{" "}
                    {formatDateTime(ticketQuery.dataUpdatedAt, locale)}. A refresh
                    failed, so this may not be the latest status.
                  </p>
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    onClick={() => void ticketQuery.refetch()}
                  >
                    Refresh reply
                  </Button>
                </div>
              ) : null}
              {selectedTicket ? (
                <div>
                  <h3 className="font-display text-xl">Customer support reply</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ticket {selectedTicket.ticket_id} ·{" "}
                    {TICKET_STATUS_LABELS[selectedTicket.status]} ·{" "}
                    {formatDate(selectedTicket.updated_at, locale)}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                    {selectedTicket.reply}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      {preview ? (
        <figure className="mt-4 rounded-lg border p-3">
          {/* The object URL is created only from an authorized attachment read. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="max-h-80 w-auto max-w-full rounded-md"
            src={preview.url}
            alt={`Preview of ${preview.fileName}`}
          />
          <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 break-all">{preview.fileName}</span>
            <Button type="button" variant="ghost" size="sm" onClick={revokePreview}>
              Close preview
            </Button>
          </figcaption>
        </figure>
      ) : null}
      {previewError ? (
        <p className="mt-3 text-sm" role="alert">
          {previewError}
        </p>
      ) : null}

      {showEmpty ? (
        <div className="mt-5 rounded-lg border p-4">
          <p className="font-medium">
            No saved after-sales request in this browser yet.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This does not confirm anything about applications sent from another
            browser or device. If you contacted support elsewhere, use the
            application number below.
          </p>
        </div>
      ) : null}

      {!pending && !unknown && !conflict ? (
        <form className="mt-6 space-y-4" onSubmit={submitRequest} noValidate>
          <fieldset className="space-y-4" disabled={locked || Boolean(uploadingFile)}>
            <legend className="font-display text-xl">Start a request</legend>

            <div>
              <label className="block text-sm font-medium" htmlFor={typeId}>
                What went wrong?
              </label>
              <select
                ref={typeRef}
                id={typeId}
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 aria-invalid:border-destructive"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as RequestType | "");
                  setTypeError(null);
                }}
                aria-invalid={Boolean(typeError)}
                aria-describedby={typeError ? `${fieldId}-type-error` : undefined}
              >
                <option value="" disabled>
                  Choose an issue
                </option>
                {REQUEST_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {typeError ? (
                <p
                  className="mt-1 text-sm text-destructive"
                  id={`${fieldId}-type-error`}
                  role="alert"
                >
                  {typeError}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium" htmlFor={descriptionId}>
                Description
              </label>
              <textarea
                ref={descriptionRef}
                id={descriptionId}
                className="mt-2 min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 aria-invalid:border-destructive"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setDescriptionError(null);
                }}
                aria-invalid={Boolean(descriptionError)}
                aria-describedby={[
                  descriptionHelpId,
                  descriptionError ? descriptionErrorId : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <p
                className="mt-1 text-sm text-muted-foreground"
                id={descriptionHelpId}
              >
                {descriptionCount} / {MAX_DESCRIPTION_CODE_POINTS} characters
              </p>
              {descriptionError ? (
                <p
                  className="mt-1 text-sm text-destructive"
                  id={descriptionErrorId}
                  role="alert"
                >
                  {descriptionError}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium" htmlFor={fileId}>
                Photos (optional, up to {MAX_ATTACHMENTS})
              </label>
              <input
                ref={fileRef}
                id={fileId}
                className="mt-2 block w-full text-sm"
                type="file"
                accept={ATTACHMENT_MEDIA_TYPES.join(",")}
                multiple
                onChange={(event) => void addFiles(event)}
                aria-describedby={[
                  fileHelpId,
                  fileErrors.length ? fileErrorId : null,
                  filesError ? fileCountErrorId : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <p className="mt-1 text-sm text-muted-foreground" id={fileHelpId}>
                JPEG, PNG, or WebP. Up to 5 MiB each. An accepted upload only
                confirms that the photo was received.
              </p>
              {uploadingFile ? (
                <p className="mt-2 text-sm" role="status">
                  Uploading {uploadingFile}…
                </p>
              ) : null}
              {fileErrors.length ? (
                <ul
                  className="mt-2 space-y-1 text-sm text-destructive"
                  id={fileErrorId}
                  role="alert"
                >
                  {fileErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
              {filesError ? (
                <p
                  className="mt-1 text-sm text-destructive"
                  id={fileCountErrorId}
                  role="alert"
                >
                  {filesError}
                </p>
              ) : null}
              {attachmentList(attachments, { removable: true })}
            </div>

            {writeError && !pending ? (
              <p className="text-sm text-destructive" role="alert">
                {writeError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={
                  locked ||
                  submitting ||
                  Boolean(uploadingFile) ||
                  descriptionCount > MAX_DESCRIPTION_CODE_POINTS
                }
              >
                {submitting ? "Sending request…" : "Send request"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={cancelDraft}
                disabled={locked || submitting}
              >
                Cancel editing
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Cancel editing only clears this unsent form. It does not withdraw
              a request that was already sent.
            </p>
          </fieldset>
        </form>
      ) : null}

      {!forbidden && !pending && !conflict ? manualRecovery : null}
    </section>
  );
}
