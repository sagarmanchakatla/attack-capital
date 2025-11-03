"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { toast } from "sonner";
import {
  Phone,
  Loader2,
  Volume2,
  VolumeX,
  BarChart3,
  Calendar,
  Cpu,
  Zap,
} from "lucide-react";

type AMDStrategy = "twilio-native" | "jambonz" | "huggingface" | "gemini";

interface CallStatus {
  callId: string;
  callSid: string;
  status: string;
  detectionResult?: string;
  confidence?: number;
}

interface CallStats {
  totalCalls: number;
  humanDetected: number;
  machineDetected: number;
  undecided: number;
  successRate: number;
}

export default function HomePage() {
  const { data: session } = useSession();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [strategy, setStrategy] = useState<AMDStrategy>("twilio-native");
  const [loading, setLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus | null>(null);
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [callStats, setCallStats] = useState<CallStats>({
    totalCalls: 0,
    humanDetected: 0,
    machineDetected: 0,
    undecided: 0,
    successRate: 0,
  });

  // Test numbers for quick testing
  const testNumbers = [
    { name: "Costco Voicemail", number: "+18007742678", type: "machine" },
    { name: "Nike Voicemail", number: "+18008066453", type: "machine" },
    { name: "PayPal Voicemail", number: "+18882211161", type: "machine" },
  ];

  const handleDial = async () => {
    if (!phoneNumber) {
      toast.error("Please enter a phone number");
      return;
    }

    setLoading(true);
    setCallStatus({
      callId: "",
      callSid: "",
      status: "initiating",
    });

    try {
      const formattedNumber = phoneNumber.startsWith("+")
        ? phoneNumber
        : `+1${phoneNumber}`;

      // Determine API endpoint based on strategy
      let endpoint = "/api/dial";
      if (strategy === "jambonz") {
        endpoint = "/api/dial/jambonz";
      } else if (strategy === "huggingface") {
        endpoint = "/api/dial/huggingface";
      }
      // Add other strategies as they become available

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: formattedNumber,
          amdStrategy: strategy,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Call initiated with ${getStrategyName(strategy)}!`);
        setCallStatus({
          callId: data.callId,
          callSid: data.callSid,
          status: data.status || "initiated",
        });

        pollCallStatus(data.callId);
        fetchCallHistory();
        fetchCallStats();
      } else {
        if (data.code === 21219) {
          toast.error(
            <div>
              <div className="font-semibold">Number Not Verified</div>
              <div className="text-sm">{data.message}</div>
            </div>,
            { duration: 8000 }
          );
        } else {
          toast.error(data.error || "Failed to initiate call");
        }
        setCallStatus(null);
      }
    } catch (error) {
      toast.error("An error occurred while initiating call");
      setCallStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const pollCallStatus = async (callId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/calls/${callId}`);
        if (response.ok) {
          const callData = await response.json();

          setCallStatus((prev) =>
            prev
              ? {
                  ...prev,
                  status: callData.status,
                  detectionResult: callData.detectionResult,
                  confidence: callData.confidence,
                }
              : null
          );

          // Stop polling if call is completed or failed
          if (
            ["completed", "failed", "busy", "no-answer"].includes(
              callData.status
            )
          ) {
            clearInterval(interval);

            // Show appropriate toast based on detection result
            if (callData.detectionResult === "human") {
              toast.success("🎉 Human detected - Call connected!");
            } else if (callData.detectionResult === "machine") {
              toast.info("🤖 Voicemail detected - Call ended");
            } else if (callData.detectionResult === "undecided") {
              toast.warning("❓ Unable to determine - Check call logs");
            } else if (!callData.detectionResult) {
              toast.info("📞 Call completed");
            }

            // Refresh stats and history
            fetchCallHistory();
            fetchCallStats();
          }
        }
      } catch (error) {
        console.error("Error polling call status:", error);
        clearInterval(interval);
      }
    }, 2000);

    // Stop polling after 60 seconds
    setTimeout(() => clearInterval(interval), 60000);
  };

  const fetchCallHistory = async () => {
    try {
      const response = await fetch("/api/calls?limit=5");
      if (response.ok) {
        const data = await response.json();
        setCallHistory(data.calls || []);
      }
    } catch (error) {
      console.error("Error fetching call history:", error);
    }
  };

  const fetchCallStats = async () => {
    try {
      const response = await fetch("/api/calls?limit=100");
      if (response.ok) {
        const data = await response.json();
        const calls = data.calls || [];

        const stats: CallStats = {
          totalCalls: calls.length,
          humanDetected: calls.filter(
            (call: any) => call.detectionResult === "human"
          ).length,
          machineDetected: calls.filter(
            (call: any) => call.detectionResult === "machine"
          ).length,
          undecided: calls.filter(
            (call: any) =>
              call.detectionResult === "undecided" || !call.detectionResult
          ).length,
          successRate: 0,
        };

        const successfulDetections =
          stats.humanDetected + stats.machineDetected;
        stats.successRate =
          stats.totalCalls > 0
            ? (successfulDetections / stats.totalCalls) * 100
            : 0;

        setCallStats(stats);
      }
    } catch (error) {
      console.error("Error fetching call stats:", error);
    }
  };

  useEffect(() => {
    if (session) {
      fetchCallHistory();
      fetchCallStats();
    }
  }, [session]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-50";
      case "failed":
        return "text-red-600 bg-red-50";
      case "in-progress":
        return "text-blue-600 bg-blue-50";
      case "initiated":
        return "text-yellow-600 bg-yellow-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getDetectionIcon = (result?: string) => {
    if (result === "human")
      return <Volume2 className="w-4 h-4 text-green-600" />;
    if (result === "machine")
      return <VolumeX className="w-4 h-4 text-red-600" />;
    return null;
  };

  const getDetectionColor = (result?: string) => {
    if (result === "human")
      return "text-green-700 bg-green-50 border-green-200";
    if (result === "machine") return "text-red-700 bg-red-50 border-red-200";
    return "text-gray-700 bg-gray-50 border-gray-200";
  };

  const getStrategyName = (strategy: AMDStrategy) => {
    switch (strategy) {
      case "twilio-native":
        return "Twilio Native AMD";
      case "jambonz":
        return "Jambonz SIP AMD";
      case "huggingface":
        return "HuggingFace ML";
      case "gemini":
        return "Gemini 2.5 Flash";
      default:
        return "Unknown";
    }
  };

  const getStrategyDescription = (strategy: AMDStrategy) => {
    switch (strategy) {
      case "twilio-native":
        return "Twilio's built-in AMD with optimized settings for reliable detection";
      case "jambonz":
        return "SIP-based AMD with customizable parameters and real-time speech recognition";
      case "huggingface":
        return "Machine learning model fine-tuned for voicemail detection with real-time audio streaming";
      case "gemini":
        return "Google Gemini 2.5 Flash for multimodal audio analysis (Coming Soon)";
      default:
        return "";
    }
  };

  const getStrategyIcon = (strategy: AMDStrategy) => {
    switch (strategy) {
      case "twilio-native":
        return <Phone className="w-4 h-4" />;
      case "jambonz":
        return <Zap className="w-4 h-4" />;
      case "huggingface":
        return <Cpu className="w-4 h-4" />;
      case "gemini":
        return <BarChart3 className="w-4 h-4" />;
      default:
        return <Phone className="w-4 h-4" />;
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                AMD Detection System
              </h1>
              <p className="text-gray-600 mt-1">
                Advanced Answering Machine Detection using AI
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {session.user.name || session.user.email}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-blue-100 p-3">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Calls</p>
                <p className="text-2xl font-bold text-gray-900">
                  {callStats.totalCalls}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-green-100 p-3">
                <Volume2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Human Detected
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {callStats.humanDetected}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-red-100 p-3">
                <VolumeX className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Machine Detected
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {callStats.machineDetected}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-purple-100 p-3">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Success Rate
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {callStats.successRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Dialer Card */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold mb-6">Make a Call</h2>

              {/* Phone Number Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890 or 234567890"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Enter US number with or without +1 prefix
                </p>
              </div>

              {/* Strategy Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AMD Detection Strategy
                </label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as AMDStrategy)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                >
                  <option value="twilio-native">Twilio Native AMD</option>
                  <option value="jambonz">Jambonz SIP AMD</option>
                  <option value="huggingface">HuggingFace ML</option>
                  <option value="gemini" disabled>
                    Gemini 2.5 Flash (Coming Soon)
                  </option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {getStrategyDescription(strategy)}
                </p>
              </div>

              {/* Quick Test Numbers */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick Test Numbers
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {testNumbers.map((test) => (
                    <button
                      key={test.number}
                      type="button"
                      onClick={() => setPhoneNumber(test.number)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 text-left transition-colors"
                      disabled={loading}
                    >
                      <div className="font-medium text-gray-900">
                        {test.name}
                      </div>
                      <div className="text-xs text-gray-500">{test.number}</div>
                      <div
                        className={`text-xs mt-1 ${
                          test.type === "machine"
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        Expected: {test.type}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dial Button */}
              <button
                onClick={handleDial}
                disabled={loading || !phoneNumber}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Dialing...
                  </>
                ) : (
                  <>
                    {getStrategyIcon(strategy)}
                    Dial with {getStrategyName(strategy)}
                  </>
                )}
              </button>

              {/* Call Status */}
              {callStatus && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-medium text-blue-900 mb-2">
                    Call Status
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-700">Status:</span>
                      <span
                        className={`font-medium px-2 py-1 rounded ${getStatusColor(
                          callStatus.status
                        )}`}
                      >
                        {callStatus.status}
                      </span>
                    </div>
                    {callStatus.callSid && (
                      <div className="flex justify-between">
                        <span className="text-blue-700">Call SID:</span>
                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {callStatus.callSid}
                        </span>
                      </div>
                    )}
                    {callStatus.detectionResult && (
                      <div className="flex justify-between items-center">
                        <span className="text-blue-700">Detection:</span>
                        <span
                          className={`font-medium px-3 py-1 rounded border flex items-center gap-2 ${getDetectionColor(
                            callStatus.detectionResult
                          )}`}
                        >
                          {getDetectionIcon(callStatus.detectionResult)}
                          {callStatus.detectionResult}
                          {callStatus.confidence && (
                            <span className="text-xs opacity-75">
                              ({(callStatus.confidence * 100).toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Recent Calls */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Recent Calls</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  Last 5
                </span>
              </div>
              <div className="space-y-3">
                {callHistory.map((call) => (
                  <div
                    key={call.id}
                    className="border-b border-gray-100 pb-3 last:border-0"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm text-gray-900">
                        {call.phoneNumber}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${getStatusColor(
                          call.status
                        )}`}
                      >
                        {call.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span className="capitalize">
                        {call.amdStrategy?.replace("-", " ") || "twilio native"}
                      </span>
                      {call.detectionResult && (
                        <span
                          className={`flex items-center gap-1 px-2 py-1 rounded ${getDetectionColor(
                            call.detectionResult
                          )}`}
                        >
                          {getDetectionIcon(call.detectionResult)}
                          {call.detectionResult}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(call.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
                {callHistory.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No calls yet. Make your first call!
                  </p>
                )}
              </div>
              {callHistory.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <a
                    href="/history"
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-center"
                  >
                    View full history →
                  </a>
                </div>
              )}
            </div>

            {/* Strategy Info */}
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                {getStrategyName(strategy)}
              </h3>
              <ul className="text-sm text-blue-800 space-y-2">
                {strategy === "twilio-native" && (
                  <>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Machine Detection: Enable
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Timeout: 30 seconds
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Async Detection: Enabled
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Twilio's built-in algorithm
                    </li>
                  </>
                )}
                {strategy === "jambonz" && (
                  <>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      SIP-based AMD
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Customizable parameters
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Real-time speech recognition
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Voicemail phrase detection
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Beep/tone detection
                    </li>
                  </>
                )}
                {strategy === "huggingface" && (
                  <>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      ML-powered detection
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Real-time audio streaming
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      wav2vec2 fine-tuned model
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      Confidence scoring
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      &lt;3s latency
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Quick Tips */}
            <div className="bg-green-50 rounded-lg border border-green-200 p-6">
              <h3 className="font-semibold text-green-900 mb-3">
                Testing Tips
              </h3>
              <ul className="text-sm text-green-800 space-y-2">
                <li>• Use test numbers for consistent results</li>
                <li>• Test with your phone for human detection</li>
                <li>• Check call history for detailed logs</li>
                <li>• Monitor real-time status updates</li>
                <li>• Compare different AMD strategies</li>
                <li>• For HuggingFace: Ensure Python service is running</li>
              </ul>
            </div>

            {/* Service Status */}
            <div className="bg-orange-50 rounded-lg border border-orange-200 p-6">
              <h3 className="font-semibold text-orange-900 mb-3">
                Service Status
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-orange-800">Twilio:</span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                    Active
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-orange-800">Jambonz:</span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                    Active
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-orange-800">HuggingFace:</span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                    Check Service
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
