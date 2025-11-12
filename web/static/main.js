const dropZone = document.getElementById("drop-zone");
const browseBtn = document.getElementById("browse-btn");
const directoryPicker = document.getElementById("directory-picker");
const feedback = document.getElementById("feedback");
const resultSection = document.getElementById("result");
const jsonOutput = document.getElementById("json-output");
const fileCount = document.getElementById("file-count");
const downloadBtn = document.getElementById("download-btn");
const sourceInfo = document.getElementById("source-info");

let lastJsonText = "";
let isProcessing = false;

browseBtn.addEventListener("click", () => directoryPicker.click());
directoryPicker.addEventListener("change", async (event) => {
    const files = [...event.target.files];
    const sourceLabel = detectSourceFromFiles(files);
    await processFiles(files, sourceLabel);
    directoryPicker.value = "";
});

dropZone.addEventListener("click", (event) => {
    if (event.target === dropZone) {
        directoryPicker.click();
    }
});

dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        directoryPicker.click();
    }
});

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", (event) => {
    if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove("is-dragover");
    }
});

dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");

    const dataTransfer = event.dataTransfer;
    const files = await extractFilesFromDataTransfer(dataTransfer);
    const sourceLabel = detectSourceFromDataTransfer(dataTransfer, files);
    await processFiles(files, sourceLabel);
});

downloadBtn.addEventListener("click", () => {
    if (!lastJsonText) {
        showFeedback("Nada para baixar ainda.", "error");
        return;
    }

    const blob = new Blob([lastJsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sounds.json";
    anchor.click();
    URL.revokeObjectURL(url);
});

async function processFiles(files, sourceLabel = "") {
    if (isProcessing) {
        return;
    }

    if (!files || !files.length) {
        showFeedback("Nenhum arquivo foi recebido.", "error");
        return;
    }

    isProcessing = true;
    setBusyState(true);
    showFeedback("Processando arquivos...", "info");

    try {
        const { entries, totalSounds } = buildSoundEntries(files);

        if (!totalSounds) {
            resultSection.hidden = true;
            showFeedback("Nenhum arquivo .ogg foi encontrado.", "error");
            return;
        }

        const jsonText = buildJsonFromEntries(entries);
        lastJsonText = jsonText;
        jsonOutput.value = jsonText;
        fileCount.textContent = totalSounds;
        sourceInfo.textContent = sourceLabel ? `Fonte: ${sourceLabel}` : "";
        sourceInfo.hidden = !sourceLabel;
        resultSection.hidden = false;
        showFeedback(`Encontrados ${totalSounds} arquivos .ogg.`, "success");
    } catch (error) {
        console.error(error);
        resultSection.hidden = true;
        showFeedback("Erro ao processar os arquivos.", "error");
    } finally {
        isProcessing = false;
        setBusyState(false);
    }
}

function buildSoundEntries(files) {
    const grouped = new Map();
    let totalSounds = 0;

    for (const file of files) {
        const relativePath = getRelativePath(file);
        if (!relativePath || !relativePath.toLowerCase().endsWith(".ogg")) {
            continue;
        }

        const normalized = normalizePath(relativePath);
        const withoutExt = normalized.replace(/\.ogg$/i, "");
        const segments = withoutExt.split("/").filter(Boolean);
        if (!segments.length) {
            continue;
        }

        const key = deriveKeyFromSegments(segments);
        const soundPath = withoutExt;

        if (!grouped.has(key)) {
            grouped.set(key, new Set());
        }

        const set = grouped.get(key);
        if (!set.has(soundPath)) {
            set.add(soundPath);
            totalSounds += 1;
        }
    }

    const entries = Array.from(grouped.entries())
        .map(([key, soundSet]) => ({
            key,
            sounds: Array.from(soundSet).sort((a, b) => naturalCompare(a, b)),
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

    return { entries, totalSounds };
}

function deriveKeyFromSegments(segments) {
    const folderSegments = segments.slice(0, -1).map((segment) => segment.replace(/_/g, ""));
    const fileSegment = segments[segments.length - 1];
    const { baseName } = splitVariantFromName(fileSegment);

    return [...folderSegments, baseName].filter(Boolean).join(".");
}

function splitVariantFromName(name) {
    const match = name.match(/^(.*?)(?:_(\d+))?$/);
    if (!match) {
        return { baseName: name, variant: null };
    }

    const baseName = match[1] || name;
    const variant = match[2] ? Number(match[2]) : null;
    return { baseName, variant };
}

function buildJsonFromEntries(entries) {
    const payload = {};

    for (const { key, sounds } of entries) {
        payload[key] = {
            sounds,
        };
    }

    return JSON.stringify(payload, null, 2);
}

function naturalCompare(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function getRelativePath(file) {
    if (!file) {
        return "";
    }

    return (
        file.webkitRelativePath ||
        file.relativePath ||
        file._relativePath ||
        file.name ||
        ""
    );
}

function normalizePath(path) {
    return path
        .replace(/^\.+[\\/]/, "")
        .replace(/^[\\/]+/, "")
        .replace(/\\/g, "/");
}

function showFeedback(message, variant) {
    feedback.textContent = message;
    feedback.dataset.variant = variant;
}

function setBusyState(isBusy) {
    dropZone.classList.toggle("is-busy", isBusy);
    dropZone.setAttribute("aria-busy", isBusy ? "true" : "false");
    browseBtn.disabled = isBusy;
}

async function extractFilesFromDataTransfer(dataTransfer) {
    const files = [];

    if (dataTransfer.items && dataTransfer.items.length) {
        const entries = [];

        for (const item of dataTransfer.items) {
            if (item.kind !== "file") {
                continue;
            }

            const entry = item.webkitGetAsEntry?.();
            if (entry) {
                entries.push(entry);
            } else {
                const file = item.getAsFile?.();
                if (file) {
                    files.push(file);
                }
            }
        }

        for (const entry of entries) {
            await walkFileTree(entry, files);
        }
    }

    if (!files.length && dataTransfer.files && dataTransfer.files.length) {
        files.push(...dataTransfer.files);
    }

    return files;
}

async function walkFileTree(entry, files) {
    if (entry.isFile) {
        const file = await entryToFile(entry);
        if (file) {
            files.push(file);
        }
        return;
    }

    if (entry.isDirectory) {
        const reader = entry.createReader();

        async function readBatch() {
            const entries = await readEntries(reader);
            if (!entries.length) {
                return;
            }

            for (const child of entries) {
                await walkFileTree(child, files);
            }

            await readBatch();
        }

        await readBatch();
    }
}

function entryToFile(entry) {
    return new Promise((resolve, reject) => {
        entry.file(
            (file) => {
                const relativePath = cleanFullPath(entry.fullPath) || file.name;
                Object.defineProperty(file, "_relativePath", {
                    value: relativePath,
                    writable: false,
                    configurable: true,
                });
                resolve(file);
            },
            (error) => reject(error)
        );
    });
}

function readEntries(reader) {
    return new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
    });
}

function detectSourceFromFiles(files) {
    if (!files || !files.length) {
        return "";
    }

    const roots = new Set();

    for (const file of files) {
        const relativePath = normalizePath(getRelativePath(file));
        if (!relativePath) {
            continue;
        }

        const [root] = relativePath.split("/");
        if (root) {
            roots.add(root);
        }
    }

    if (!roots.size) {
        return files[0].name || "";
    }

    if (roots.size === 1) {
        return roots.values().next().value;
    }

    return `${roots.size} pastas`;
}

function detectSourceFromDataTransfer(dataTransfer, files) {
    if (dataTransfer.items && dataTransfer.items.length) {
        const roots = new Set();

        for (const item of dataTransfer.items) {
            const entry = item.webkitGetAsEntry?.();
            if (!entry) {
                continue;
            }

            const cleanPath = cleanFullPath(entry.fullPath);
            const [root] = cleanPath.split("/");
            if (root) {
                roots.add(root);
            }
        }

        if (roots.size === 1) {
            return roots.values().next().value;
        }
        if (roots.size > 1) {
            return `${roots.size} pastas`;
        }
    }

    return detectSourceFromFiles(files);
}

function cleanFullPath(fullPath = "") {
    return fullPath.replace(/^\//, "");
}
