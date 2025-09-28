import { useEffect, useState } from "react";
import { Users, HeartPulse, RadioTower, AlertTriangle, CheckCircle } from "lucide-react";

const ts = () => new Date().toLocaleTimeString();

type Rescuee = {
  id: string;
  bpm: number | null;
  avg: number | null;
  contact: string;
  emergency: boolean;
  rescued: boolean;
  last: string;
};

type Rescuer = {
  id: string;
  status: string;
  last: string;
};

type RescuerLink = {
  rescuerId: string;
  rssi: number | null;
  emergency: boolean;
};

export default function VibrasenseDashboard() {
  const [rescuees, setRescuees] = useState<Record<string, Rescuee>>({});
  const [rescuers, setRescuers] = useState<Record<string, Rescuer>>({});
  const [rescuerLinks, setRescuerLinks] = useState<Record<string, RescuerLink[]>>({});
  const [connected, setConnected] = useState(false);

  // === PACKET PARSER ===
  const handleLine = (line: string) => {
    try {
      const fields = Object.fromEntries(
        line
          .split(",")
          .map((part) => part.split("="))
          .filter(([k, v]) => k && v)
          .map(([k, v]) => [k.trim(), v.trim()])
      );

      console.log("📝 Parsed fields:", fields);
      const type = fields["TYPE"]?.toUpperCase();

      if (type === "RESCUEE") {
        setRescuees((prev) => ({
          ...prev,
          [fields["ID"]]: {
            id: fields["ID"],
            bpm: fields["BPM"] ? Number(fields["BPM"]) : null,
            avg: fields["AVG"] ? Number(fields["AVG"]) : null,
            contact: fields["CONTACT"] || "?",
            emergency: fields["EMERGENCY"] === "1",
            rescued: fields["RESCUED"] === "1",
            last: ts(),
          },
        }));
      } else if (type === "RESCUER") {
        const rescId = fields["ID"];
        const target = fields["TARGET"];
        const rssi = fields["RSSI"] ? Number(fields["RSSI"]) : null;
        const emergency = fields["EMERGENCY"] === "1";
        const status = fields["STATUS"] || (target ? "ENGAGED" : "READY");

        setRescuers((prev) => ({
          ...prev,
          [rescId]: { id: rescId, status, last: ts() },
        }));

        if (target) {
          setRescuerLinks((prev) => ({
            ...prev,
            [target]: [
              ...(prev[target] || []).filter((l) => l.rescuerId !== rescId),
              { rescuerId: rescId, rssi, emergency },
            ],
          }));
        }
      } else {
        console.warn("⚠️ Unknown packet type:", type, "Line:", line);
      }
    } catch (err) {
      console.error("❌ Failed to parse line:", line, err);
    }
  };

  // === CONNECT TO BRIDGE ===
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000");

    ws.onopen = () => {
      console.log("✅ Connected to WebSocket bridge");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const line = event.data.trim();
      if (line) handleLine(line);
    };

    ws.onclose = () => {
      console.log("❌ Disconnected from WebSocket bridge");
      setConnected(false);
    };

    ws.onerror = (err) => {
      console.error("⚠️ WebSocket error:", err);
      setConnected(false);
    };

    return () => ws.close();
  }, []);

  const rescueeArray = Object.values(rescuees);
  const rescuerArray = Object.values(rescuers);
  const alerts = rescueeArray.filter((r) => r.emergency || r.contact !== "OK");

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6" />
          <h1 className="text-xl font-semibold">Vibrasense Rescue Dashboard</h1>
        </div>
        <div>
          {connected ? (
            <span className="text-sm text-green-600">🟢 Connected</span>
          ) : (
            <span className="text-sm text-red-600">🔴 Disconnected</span>
          )}
        </div>
      </header>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-red-600 text-white px-5 py-2 text-sm flex items-center gap-2 sticky top-[52px] z-20">
          <AlertTriangle className="w-4 h-4" /> Critical Alerts:{" "}
          {alerts.map((r) => r.id).join(", ")}
        </div>
      )}

      <main className="p-5 space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white shadow rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{rescueeArray.length}</div>
            <div className="text-gray-600">Rescuees</div>
          </div>
          <div className="bg-white shadow rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{rescuerArray.length}</div>
            <div className="text-gray-600">Rescuers</div>
          </div>
          <div className="bg-red-100 border border-red-400 text-red-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {rescueeArray.filter((r) => r.emergency).length}
            </div>
            <div>Emergencies</div>
          </div>
          <div className="bg-green-100 border border-green-400 text-green-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {rescueeArray.filter((r) => r.rescued).length}
            </div>
            <div>Rescued</div>
          </div>
          <div className="bg-orange-100 border border-orange-400 text-orange-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {rescueeArray.filter((r) => r.contact !== "OK").length}
            </div>
            <div>Lost Contact</div>
          </div>
        </section>

        {/* Rescuees */}
        <section>
          <h2 className="text-lg font-bold flex items-center gap-2 text-emerald-700 mb-4">
            <HeartPulse className="w-5 h-5" /> Rescuees
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rescueeArray.map((r) => {
              const links = rescuerLinks[r.id] || [];
              return (
                <div
                  key={r.id}
                  className={`rounded-lg shadow p-4 border ${
                    r.emergency
                      ? "bg-red-600 text-white border-red-700"
                      : r.rescued
                      ? "bg-green-100 border-green-400"
                      : "bg-white"
                  }`}
                >
                  <div className="flex justify-between">
                    <h3 className="font-bold">{r.id}</h3>
                    <span className="text-xs">{r.last}</span>
                  </div>
                  <p>BPM: {r.bpm ?? "—"} | Avg: {r.avg ?? "—"}</p>
                  <p>
                    {r.contact === "OK" ? (
                      <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">
                        Contact OK
                      </span>
                    ) : (
                      <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs">
                        Lost Contact
                      </span>
                    )}
                  </p>
                  {r.emergency && (
                    <p className="mt-1 font-bold text-lg">🚨 EMERGENCY</p>
                  )}
                  {r.rescued && (
                    <p className="mt-1 font-bold text-lg flex items-center gap-1 text-green-700">
                      <CheckCircle className="w-4 h-4" /> RESCUED
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {links.map((l) => (
                      <span
                        key={l.rescuerId}
                        className={`px-2 py-0.5 rounded text-xs ${
                          l.emergency
                            ? "bg-red-100 text-red-800 font-bold"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {l.rescuerId} ({l.rssi})
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Rescuers */}
        <section>
          <h2 className="text-lg font-bold flex items-center gap-2 text-indigo-700 mb-4">
            <RadioTower className="w-5 h-5" /> Rescuers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {rescuerArray.map((r) => (
              <div
                key={r.id}
                className={`rounded-lg shadow p-4 border ${
                  r.status === "ENGAGED"
                    ? "bg-yellow-100 border-yellow-400"
                    : "bg-white"
                }`}
              >
                <div className="flex justify-between">
                  <div className="font-bold">{r.id}</div>
                  <span className="text-xs">{r.last}</span>
                </div>
                <div className="text-sm">
                  Status:{" "}
                  <span
                    className={
                      r.status === "ENGAGED"
                        ? "text-yellow-700 font-semibold"
                        : "text-green-700 font-semibold"
                    }
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-5 py-6 text-center text-xs text-gray-500">
        Vibrasense • WebSocket Rescue Monitoring
      </footer>
    </div>
  );
}
