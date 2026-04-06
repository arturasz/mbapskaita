import { useRef, useState } from "react";

interface FileImportProps {
  label: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => Promise<void>;
}

export function FileImport({
  label,
  accept = ".pdf,.csv",
  multiple = true,
  onFiles,
}: FileImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      await onFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Importavimo klaida");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "Importuojama..." : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

interface DirectoryImportProps {
  label: string;
  onFiles: (files: File[]) => Promise<void>;
  extensions?: string[];
}

export function DirectoryImport({
  label,
  onFiles,
  extensions = [".pdf", ".csv"],
}: DirectoryImportProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    // File System Access API (Chrome/Edge)
    if (!("showDirectoryPicker" in window)) {
      setError("Naršyklė nepalaiko katalogų pasirinkimo. Naudokite Chrome.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      const files: File[] = [];

      for await (const entry of dirHandle.values()) {
        if (entry.kind !== "file") continue;
        const name: string = entry.name.toLowerCase();
        if (extensions.some((ext) => name.endsWith(ext))) {
          files.push(await entry.getFile());
        }
      }

      if (files.length === 0) {
        setError("Kataloge nerasta PDF/CSV failų");
        return;
      }

      await onFiles(files);
    } catch (err: any) {
      if (err?.name === "AbortError") return; // user cancelled
      setError(err instanceof Error ? err.message : "Klaida skaitant katalogą");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "Importuojama..." : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
