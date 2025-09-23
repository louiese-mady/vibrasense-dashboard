import { useEffect, useRef, useState } from "react";
import {
  Cable,
  WifiOff,
  PlugZap,
  Download,
  Bug,
  Users,
  HeartPulse,
  RadioTower,
  AlertTriangle,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

const ts = () => new Date().toLocaleTimeString();

export default function VibrasenseDashboard() {
  const [supported, setSupported] = useState(false);
  const [port, setPort] = useState<SerialPort | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  const [rescuees, setRescuees] = useState<Record<string, any>>({});
  const [rescuerLinks, setRescuerLinks] = useState<Record<string, any[]>>({});
  const [rescuers, setRescuers] = useState<Record<string, any>>({});

  const [simulate, setSimulate] = useState(false);
  const simTimer = useRef<number | null>(null);

  useEffect(() => {
    setSupported(!!("serial" in navigator));
  }, []);

  const connect = async () => {
    try {
      setConnecting(true);
      const p = await (navigator as any).serial.requestPort();
      await p.open({ baudRate: 9600 });

      const textDecoder = new TextDecoderStream();
      (p.readable as ReadableStream<Uint8Array>).pipeTo(
        textDecoder.writable as WritableStream<Uint8Array>
      );
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      setPort(p);
      setConnected(true);

      (async () => {
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value || "";
          let idx;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (line) handleLine(line);
          }
        }
      })().catch(console.error);
    } catch (e) {
      console.error(e);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      if (readerRef.current) {
        try {
          await readerRef.current.cancel();
        } catch {}
      }
      if (port) {
        try {
          await port.close();
        } catch {}
      }
    } finally {
      readerRef.current = null;
      setPort(null);
      setConnected(false);
    }
  };

  const handleLine = (line: string) => {
    const fields = Object.fromEntries(
      line.split(",").map((part) => part.split("="))
    );
    const type = fields["TYPE"];

    if (type === "RESCUEE") {
      setRescuees((prev) => ({
        ...prev,
        [fields["ID"]]: {
          id: fields["ID"],
          bpm: fields["BPM"] ? Number(fields["BPM"]) : null,
          avg: fields["AVG"] ? Number(fields["AVG"]) : null,
          contact: fields["CONTACT"] || "?",
          emergency: fields["EMERGENCY"] === "1",
          last: ts(),
        },
      }));
    } else if (type === "RESCUER") {
      const rescId = fields["ID"];
      const target = fields["TARGET"];
      const rssi = fields["RSSI"] ? Number(fields["RSSI"]) : null;
      if (target) {
        setRescuerLinks((prev) => ({
          ...prev,
          [target]: [
            ...(prev[target] || []).filter((l: any) => l.rescuerId !== rescId),
            { rescuerId: rescId, rssi },
          ],
        }));
      }
      setRescuers((prev) => ({
        ...prev,
        [rescId]: { id: rescId, last: ts() },
      }));
    }
  };

  useEffect(() => {
    if (!simulate) {
      if (simTimer.current) window.clearInterval(simTimer.current);
      simTimer.current = null;
      return;
    }
    let t = 0;
    simTimer.current = window.setInterval(() => {
      t++;
      // Simulate 2000 rescuees
      for (let i = 1; i <= 2000; i++) {
        const emergency = Math.random() < 0.01 ? 1 : 0;
        const fakeRescuee = `TYPE=RESCUEE,ID=R${i},BPM=${
          60 + Math.round(20 * Math.random())
        },AVG=75,CONTACT=${t % 20 < 19 ? "OK" : "LOST"},EMERGENCY=${emergency}`;
        handleLine(fakeRescuee);
      }
      // Simulate 100 rescuers with subset links
      for (let j = 1; j <= 100; j++) {
        for (let i = 1; i <= 2000; i += 25) {
          const fakeLink = `TYPE=RESCUER,ID=H${j},TARGET=R${i},RSSI=${
            -60 - Math.floor(Math.random() * 20)
          }`;
          handleLine(fakeLink);
        }
      }
    }, 3000);
    return () => {
      if (simTimer.current) window.clearInterval(simTimer.current);
      simTimer.current = null;
    };
  }, [simulate]);

  const exportCSV = () => {
    let rows: string[] = [];
    Object.values(rescuees).forEach((r: any) => {
      rows.push(
        `${r.last},RESCUEE,${r.id},${r.bpm},${r.avg},${r.contact},EMERGENCY=${
          r.emergency ? 1 : 0
        }`
      );
    });
    Object.entries(rescuerLinks).forEach(([rescueeId, links]: any) => {
      links.forEach((l: any) => {
        rows.push(`${ts()},RESCUER,${l.rescuerId},TARGET=${rescueeId},${l.rssi}`);
      });
    });
    const header = "time,type,id,info1,info2\n";
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibrasense_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rescueeArray = Object.values(rescuees);
  const rescuerArray = Object.values(rescuers);

  // Virtualized Rescuee List
  function RescueeList() {
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
      count: rescueeArray.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 30,
    });

    return (
      <div
        ref={parentRef}
        style={{ height: "400px", overflow: "auto", position: "relative" }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const r: any = rescueeArray[virtualRow.index];
            if (!r) return null;
            const links = rescuerLinks[r.id] || [];
            return (
              <div
                key={r.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`grid grid-cols-7 border-b px-2 py-1 text-sm ${
                  r.emergency ? "bg-red-100" : ""
                }`}
              >
                <div className="font-semibold">{r.id}</div>
                <div>{r.bpm ?? "—"}</div>
                <div>{r.avg ?? "—"}</div>
                <div>{r.contact}</div>
                <div>{r.emergency ? "🚨" : "—"}</div>
                <div>{r.last}</div>
                <div>
                  {links.map((l: any) => `${l.rescuerId}(${l.rssi})`).join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Virtualized Rescuer List
  function RescuerList() {
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
      count: rescuerArray.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 30,
    });

    return (
      <div
        ref={parentRef}
        style={{ height: "200px", overflow: "auto", position: "relative" }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const r: any = rescuerArray[virtualRow.index];
            if (!r) return null;
            return (
              <div
                key={r.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="grid grid-cols-2 border-b px-2 py-1 text-sm"
              >
                <div className="font-semibold">{r.id}</div>
                <div>{r.last}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const alerts = rescueeArray.filter(
    (r: any) => r.emergency || r.contact !== "OK"
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white border-b px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6" />
          <h1 className="text-xl font-semibold">Vibrasense Rescue Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          {!supported && (
            <span className="text-sm text-red-600 flex items-center gap-1">
              <WifiOff className="w-4 h-4" />
              Web Serial not supported
            </span>
          )}
          {connected ? (
            <button
              onClick={disconnect}
              className="px-3 py-1.5 rounded-xl bg-gray-900 text-white flex items-center gap-2"
            >
              <PlugZap className="w-4 h-4" /> Disconnect
            </button>
          ) : (
            <button
              disabled={!supported || connecting}
              onClick={connect}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-2"
            >
              <Cable className="w-4 h-4" />{" "}
              {connecting ? "Connecting..." : "Connect"}
            </button>
          )}
          <button
            onClick={() => setSimulate((v) => !v)}
            className={`px-3 py-1.5 rounded-xl border ${
              simulate
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700"
            }`}
          >
            <Bug className="w-4 h-4" /> {simulate ? "Stop Sim" : "Simulate"}
          </button>
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 rounded-xl border bg-white text-gray-700 hover:bg-gray-100 flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </header>

      {alerts.length > 0 && (
        <div className="bg-red-600 text-white px-5 py-2 text-sm flex items-center gap-2 sticky top-[52px] z-20">
          <AlertTriangle className="w-4 h-4" /> Critical Alerts:{" "}
          {alerts.map((r: any) => r.id).join(", ")}
        </div>
      )}

      <main className="p-5 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-emerald-700 mb-2">
          <HeartPulse className="w-5 h-5" /> Rescuees (Virtualized)
        </h2>
        <div className="grid grid-cols-7 font-semibold border-b px-2 py-1 bg-gray-100 text-sm">
          <div>ID</div>
          <div>BPM</div>
          <div>Avg</div>
          <div>Contact</div>
          <div>Emergency</div>
          <div>Last Seen</div>
          <div>Nearby Rescuers</div>
        </div>
        <RescueeList />

        <h2 className="text-lg font-bold flex items-center gap-2 text-indigo-700 mb-2">
          <RadioTower className="w-5 h-5" /> Rescuers (Virtualized)
        </h2>
        <div className="grid grid-cols-2 font-semibold border-b px-2 py-1 bg-gray-100 text-sm">
          <div>ID</div>
          <div>Last Seen</div>
        </div>
        <RescuerList />
      </main>

      <footer className="px-5 py-6 text-center text-xs text-gray-500">
        Vibrasense • 2000-node Scalable Rescue Monitoring • Web Serial
      </footer>
    </div>
  );
}
