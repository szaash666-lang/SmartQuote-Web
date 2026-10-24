import { pluginExtensionApi, type ApiEnvelope } from "@/api/v1";
import type { RfqCase, RfqCaseSummary, RfqStatus } from "./types";

const API_ROOT = "astrbot_plugin_rfq_assistant";

export class RfqApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "RfqApiError";
    this.status = status;
  }

  get isConflict() {
    return this.status === 409;
  }
}

function unwrap<T>(response: { data: ApiEnvelope<T> | T }): T {
  const payload = response.data;
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in payload &&
    "status" in payload &&
    (payload.status === "ok" || payload.status === "error")
  ) {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.status !== "ok") {
      throw new RfqApiError(envelope.message || "询价插件返回了错误。");
    }
    return envelope.data;
  }
  return payload as T;
}

async function request<T>(operation: () => Promise<any>): Promise<T> {
  try {
    return unwrap<T>(await operation());
  } catch (error: any) {
    if (error instanceof RfqApiError) throw error;
    const status = Number(error?.response?.status || 0);
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.detail ||
      error?.message ||
      "无法连接询价插件。";
    throw new RfqApiError(String(message), status);
  }
}

async function download(endpoint: string) {
  try {
    const response = await pluginExtensionApi.get(`${API_ROOT}/${endpoint}`, {
      responseType: "blob",
    });
    return {
      blob: response.data as unknown as Blob,
      contentDisposition: String(response.headers["content-disposition"] || ""),
    };
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    let message = error?.message || "文件下载失败。";
    const body = error?.response?.data;
    if (body instanceof Blob && body.type.includes("json")) {
      try {
        const parsed = JSON.parse(await body.text());
        message = parsed.message || parsed.detail || message;
      } catch {
        // Keep the transport error when the response body is not valid JSON.
      }
    }
    throw new RfqApiError(String(message), status);
  }
}

export const rfqApi = {
  list(search = "", status: RfqStatus | "" = "") {
    return request<{ cases: RfqCaseSummary[] }>(() =>
      pluginExtensionApi.get(`${API_ROOT}/cases`, {
        params: { search, status },
      }),
    );
  },
  get(caseId: string) {
    return request<RfqCase>(() =>
      pluginExtensionApi.get(`${API_ROOT}/cases/${caseId}`),
    );
  },
  create(requestText: string) {
    return request<RfqCase>(() =>
      pluginExtensionApi.post(`${API_ROOT}/cases/create`, {
        request_text: requestText,
      }),
    );
  },
  update(
    caseId: string,
    payload: {
      expected_revision: number;
      clarification_text: string;
      fields: Record<string, string | number | string[]>;
    },
  ) {
    return request<RfqCase>(() =>
      pluginExtensionApi.post(`${API_ROOT}/cases/${caseId}/update`, payload),
    );
  },
  analyze(caseId: string, expectedRevision: number) {
    return request<RfqCase>(() =>
      pluginExtensionApi.post(`${API_ROOT}/cases/${caseId}/analyze`, {
        expected_revision: expectedRevision,
      }),
    );
  },
  uploadAttachment(caseId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return request<RfqCase>(() =>
      pluginExtensionApi.post(
        `${API_ROOT}/cases/${caseId}/attachments`,
        formData,
      ),
    );
  },
  confirm(caseId: string, expectedRevision: number, comment: string) {
    return request<RfqCase>(() =>
      pluginExtensionApi.post(
        `${API_ROOT}/cases/${caseId}/confirm-requirements`,
        {
          expected_revision: expectedRevision,
          comment,
        },
      ),
    );
  },
  decide(
    caseId: string,
    expectedRevision: number,
    decision: "approved" | "rejected",
    comment: string,
  ) {
    return request<RfqCase>(() =>
      pluginExtensionApi.post(`${API_ROOT}/cases/${caseId}/approve-solutions`, {
        expected_revision: expectedRevision,
        decision,
        comment,
      }),
    );
  },
  importCatalog(file: File) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return request<{ version_id: number; product_count: number }>(() =>
      pluginExtensionApi.post(`${API_ROOT}/catalog/import`, formData),
    );
  },
  catalogTemplate() {
    return download("catalog/template");
  },
  exportCase(caseId: string) {
    return download(`cases/${caseId}/export`);
  },
};
