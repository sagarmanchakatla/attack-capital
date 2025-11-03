// lib/jambonz/utils.ts
import { prisma } from "@/lib/db";

/**
 * Get call status with real-time updates
 */
export async function getCallStatus(callId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!call) {
    return null;
  }

  // Determine current state
  const latestEvent = call.events[0];
  const state = determineCallState(call, latestEvent);

  return {
    ...call,
    state,
    events: call.events,
  };
}

/**
 * Determine human-readable call state
 */
function determineCallState(call: any, latestEvent?: any) {
  if (call.completedAt) {
    if (call.detectionResult === "human") {
      return "Human Detected - Call Completed";
    } else if (call.detectionResult === "machine") {
      return "Machine Detected - Hung Up";
    } else if (call.detectionResult === "undecided") {
      return "Undecided - Call Completed";
    } else if (call.status === "failed") {
      return "Call Failed";
    } else if (call.status === "busy") {
      return "Line Busy";
    } else if (call.status === "no-answer") {
      return "No Answer";
    }
    return "Call Completed";
  }

  if (call.answeredAt && !call.detectionResult) {
    return "AMD Detection In Progress...";
  }

  if (call.answeredAt) {
    return "Call Answered";
  }

  if (call.status === "ringing") {
    return "Ringing...";
  }

  if (call.status === "initiated") {
    return "Initiating Call...";
  }

  return "Unknown State";
}

/**
 * Get AMD statistics for analysis
 */
export async function getAMDStatistics(userId?: string) {
  const where = userId ? { userId } : {};

  const [totalCalls, humanCalls, machineCalls, undecidedCalls, failedCalls] =
    await Promise.all([
      prisma.call.count({
        where: {
          ...where,
          amdStrategy: "jambonz",
        },
      }),
      prisma.call.count({
        where: {
          ...where,
          amdStrategy: "jambonz",
          detectionResult: "human",
        },
      }),
      prisma.call.count({
        where: {
          ...where,
          amdStrategy: "jambonz",
          detectionResult: "machine",
        },
      }),
      prisma.call.count({
        where: {
          ...where,
          amdStrategy: "jambonz",
          detectionResult: "undecided",
        },
      }),
      prisma.call.count({
        where: {
          ...where,
          amdStrategy: "jambonz",
          detectionResult: "failed",
        },
      }),
    ]);

  // Calculate average latency
  const callsWithLatency = await prisma.call.findMany({
    where: {
      ...where,
      amdStrategy: "jambonz",
      latency: { not: null },
    },
    select: {
      latency: true,
      confidence: true,
    },
  });

  const avgLatency = callsWithLatency.length
    ? callsWithLatency.reduce((sum, call) => sum + (call.latency || 0), 0) /
      callsWithLatency.length
    : 0;

  const avgConfidence = callsWithLatency.length
    ? callsWithLatency.reduce((sum, call) => sum + (call.confidence || 0), 0) /
      callsWithLatency.length
    : 0;

  return {
    totalCalls,
    humanCalls,
    machineCalls,
    undecidedCalls,
    failedCalls,
    avgLatency: Math.round(avgLatency),
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    accuracy:
      totalCalls > 0
        ? Math.round(((humanCalls + machineCalls) / totalCalls) * 100)
        : 0,
  };
}

/**
 * Get detailed call history for analysis
 */
export async function getCallHistory(userId: string, limit = 20) {
  const calls = await prisma.call.findMany({
    where: {
      userId,
      amdStrategy: "jambonz",
    },
    include: {
      events: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return calls.map((call) => ({
    ...call,
    state: determineCallState(call),
  }));
}

/**
 * Export calls to CSV format
 */
export function exportCallsToCSV(calls: any[]) {
  const headers = [
    "Call ID",
    "Phone Number",
    "Strategy",
    "Detection Result",
    "Confidence",
    "Latency (ms)",
    "Status",
    "Duration (s)",
    "Started At",
    "Completed At",
  ];

  const rows = calls.map((call) => [
    call.id,
    call.phoneNumber,
    call.amdStrategy,
    call.detectionResult || "N/A",
    call.confidence || "N/A",
    call.latency || "N/A",
    call.status,
    call.duration || "N/A",
    call.startedAt.toISOString(),
    call.completedAt?.toISOString() || "N/A",
  ]);

  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
  return csv;
}

/**
 * Validate Jambonz configuration
 */
export function validateJambonzConfig() {
  const required = [
    "JAMBONZ_BASE_URL",
    "JAMBONZ_API_KEY",
    "JAMBONZ_ACCOUNT_SID",
    "JAMBONZ_APPLICATION_SID",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing Jambonz configuration: ${missing.join(", ")}\n` +
        "Please check your .env file."
    );
  }

  return true;
}

/**
 * Format phone number to E.164
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // If already has country code
  if (digits.startsWith("1") && digits.length === 11) {
    return `+${digits}`;
  }

  // Assume US number if 10 digits
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Return as-is with + prefix
  return `+${digits}`;
}
