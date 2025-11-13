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
            if (fileCount) {
                fileCount.hidden = true;
            }
            showFeedback("Nenhum arquivo .ogg foi encontrado.", "error");
            return;
        }

        const jsonText = buildJsonFromEntries(entries);
        lastJsonText = jsonText;
        jsonOutput.value = jsonText;
        if (fileCount) {
            fileCount.hidden = false;
            fileCount.textContent = `Total de sons: ${totalSounds}`;
        }
        sourceInfo.textContent = sourceLabel ? `Fonte: ${sourceLabel}` : "";
        sourceInfo.hidden = !sourceLabel;
        resultSection.hidden = false;
        showFeedback(`Encontrados ${totalSounds} arquivos .ogg.`, "success");
    } catch (error) {
        console.error(error);
        resultSection.hidden = true;
        if (fileCount) {
            fileCount.hidden = true;
        }
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

const modelAdditionsDrop = document.getElementById("model-additions-drop");
const modelBaseDrop = document.getElementById("model-base-drop");

if (modelAdditionsDrop && modelBaseDrop) {
    const modelSection = document.getElementById("modeldata");
    const additionsInput = document.getElementById("model-additions-input");
    const additionsBrowseBtn = document.getElementById("model-additions-browse");
    const additionsFeedback = document.getElementById("model-additions-feedback");
    const additionsSummary = document.getElementById("model-additions-summary");

    const baseInput = document.getElementById("model-base-input");
    const baseBrowseBtn = document.getElementById("model-base-browse");
    const baseFeedback = document.getElementById("model-base-feedback");
    const baseSummary = document.getElementById("model-base-summary");

    const processBtn = document.getElementById("modeldata-process-btn");
    const generalFeedback = document.getElementById("modeldata-feedback");
    const previewSection = document.getElementById("modeldata-preview");
    const previewList = document.getElementById("modeldata-preview-list");
    const previewSummary = document.getElementById("modeldata-summary");
    const downloadZipBtn = document.getElementById("modeldata-download-btn");

    const modelState = {
        additionsFiles: [],
        baseFiles: [],
        zipBlob: null,
    };

    let isProcessingModels = false;

    setupModelDropZone({
        zone: modelAdditionsDrop,
        input: additionsInput,
        browseBtn: additionsBrowseBtn,
        feedbackEl: additionsFeedback,
        async onFiles(payload) {
            await handleAdditions(payload);
        },
    });

    setupModelDropZone({
        zone: modelBaseDrop,
        input: baseInput,
        browseBtn: baseBrowseBtn,
        feedbackEl: baseFeedback,
        async onFiles(payload) {
            await handleBase(payload);
        },
    });

    processBtn?.addEventListener("click", () => {
        void handleModelProcessing();
    });

    downloadZipBtn?.addEventListener("click", () => {
        if (!modelState.zipBlob) {
            updateFeedbackElement(generalFeedback, "Gere a mescla antes de baixar.", "error");
            return;
        }
        triggerZipDownload(modelState.zipBlob);
    });

    function refreshModelProcessState() {
        const canProcess = modelState.additionsFiles.length > 0 && modelState.baseFiles.length > 0;
        if (processBtn) {
            processBtn.disabled = !canProcess || isProcessingModels;
        }
        if (downloadZipBtn) {
            downloadZipBtn.disabled = !modelState.zipBlob;
        }
    }

    function resetModelPreview() {
        if (previewSection) {
            previewSection.hidden = true;
        }
        if (previewList) {
            previewList.innerHTML = "";
        }
        if (previewSummary) {
            previewSummary.textContent = "";
        }
        modelState.zipBlob = null;
        refreshModelProcessState();
    }

    async function handleAdditions({ jsonFiles, ignoredCount }) {
        modelState.additionsFiles = jsonFiles;
        renderModelSummary(additionsSummary, jsonFiles);

        if (!jsonFiles.length) {
            updateFeedbackElement(additionsFeedback, "Nenhum arquivo .json detectado.", "error");
        } else {
            const messageParts = [`${jsonFiles.length} arquivo${jsonFiles.length === 1 ? "" : "s"} .json carregado${jsonFiles.length === 1 ? "" : "s"}.`];
            if (ignoredCount > 0) {
                messageParts.push(`${ignoredCount} arquivo${ignoredCount === 1 ? "" : "s"} ignorado${ignoredCount === 1 ? "" : "s"} por não serem .json.`);
            }
            updateFeedbackElement(additionsFeedback, messageParts.join(" "), "success");
        }

        updateFeedbackElement(generalFeedback, "", "");
        resetModelPreview();
        refreshModelProcessState();
    }

    async function handleBase({ jsonFiles, ignoredCount }) {
        modelState.baseFiles = jsonFiles;
        renderModelSummary(baseSummary, jsonFiles);

        if (!jsonFiles.length) {
            updateFeedbackElement(baseFeedback, "Nenhum arquivo .json detectado.", "error");
        } else {
            const messageParts = [`${jsonFiles.length} arquivo${jsonFiles.length === 1 ? "" : "s"} .json carregado${jsonFiles.length === 1 ? "" : "s"}.`];
            if (ignoredCount > 0) {
                messageParts.push(`${ignoredCount} arquivo${ignoredCount === 1 ? "" : "s"} ignorado${ignoredCount === 1 ? "" : "s"} por não serem .json.`);
            }
            updateFeedbackElement(baseFeedback, messageParts.join(" "), "success");
        }

        updateFeedbackElement(generalFeedback, "", "");
        resetModelPreview();
        refreshModelProcessState();
    }

    async function handleModelProcessing() {
        if (isProcessingModels || !processBtn) {
            return;
        }

        const canProcess = modelState.additionsFiles.length > 0 && modelState.baseFiles.length > 0;
        if (!canProcess) {
            updateFeedbackElement(generalFeedback, "Selecione os arquivos de entrada antes de processar.", "error");
            return;
        }

        isProcessingModels = true;
        if (modelSection) {
            modelSection.setAttribute("aria-busy", "true");
        }
        updateFeedbackElement(generalFeedback, "Mesclando arquivos...", "info");
        resetModelPreview();
        refreshModelProcessState();

        try {
            const additionParse = await parseModelFiles(modelState.additionsFiles);
            const baseParse = await parseModelFiles(modelState.baseFiles);

            if (additionParse.errors.length || baseParse.errors.length) {
                const firstError = [...additionParse.errors, ...baseParse.errors][0];
                const message = firstError ? `Erro ao ler ${firstError.key}: ${firstError.message}` : "Erro ao ler arquivos selecionados.";
                updateFeedbackElement(generalFeedback, message, "error");
                console.error("Falha ao ler arquivos de modelo:", additionParse.errors, baseParse.errors);
                return;
            }

            const mergeResult = buildModelMerge(additionParse.map, baseParse.map);
            if (!mergeResult.changedFiles.length) {
                updateFeedbackElement(generalFeedback, "Nenhum override novo foi identificado com os arquivos fornecidos.", "error");
                return;
            }

            const zipBlob = await buildModelZip(mergeResult.changedFiles);
            modelState.zipBlob = zipBlob;

            renderPreviewList(previewList, mergeResult.changedFiles);
            if (previewSection) {
                previewSection.hidden = false;
            }
            if (previewSummary) {
                previewSummary.textContent = formatModelSummary(mergeResult.stats, mergeResult.changedFiles.length, mergeResult.skippedCount);
            }

            updateFeedbackElement(generalFeedback, "Mesclagem concluída! Revise os arquivos abaixo.", "success");
        } catch (error) {
            console.error("Erro ao mesclar CustomModelData:", error);
            updateFeedbackElement(generalFeedback, "Erro ao mesclar arquivos. Verifique o console para detalhes.", "error");
        } finally {
            isProcessingModels = false;
            if (modelSection) {
                modelSection.setAttribute("aria-busy", "false");
            }
            refreshModelProcessState();
        }
    }

    function setupModelDropZone({ zone, input, browseBtn, feedbackEl, onFiles }) {
        if (!zone || !input || typeof onFiles !== "function") {
            return;
        }

        browseBtn?.addEventListener("click", () => input.click());

        zone.addEventListener("click", (event) => {
            if (event.target === zone || event.target.closest(".drop-zone__content")) {
                input.click();
            }
        });

        zone.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                input.click();
            }
        });

        zone.addEventListener("dragover", (event) => {
            event.preventDefault();
            zone.classList.add("is-dragover");
        });

        zone.addEventListener("dragleave", (event) => {
            if (!zone.contains(event.relatedTarget)) {
                zone.classList.remove("is-dragover");
            }
        });

        zone.addEventListener("drop", async (event) => {
            event.preventDefault();
            zone.classList.remove("is-dragover");
            const files = await extractFilesFromDataTransfer(event.dataTransfer);
            await handleIncomingFiles(files);
        });

        input.addEventListener("change", async (event) => {
            const files = [...event.target.files];
            await handleIncomingFiles(files);
            input.value = "";
        });

        async function handleIncomingFiles(files) {
            if (!files.length) {
                updateFeedbackElement(feedbackEl, "Nenhum arquivo foi selecionado.", "error");
                return;
            }

            setDropBusyState(zone, browseBtn, true);
            updateFeedbackElement(feedbackEl, "Carregando arquivos...", "info");

            try {
                const jsonFiles = filterJsonFiles(files);
                await onFiles({
                    jsonFiles,
                    ignoredCount: files.length - jsonFiles.length,
                    totalCount: files.length,
                });
            } catch (error) {
                console.error("Erro ao processar arquivos:", error);
                updateFeedbackElement(feedbackEl, "Erro ao processar arquivos.", "error");
            } finally {
                setDropBusyState(zone, browseBtn, false);
            }
        }
    }

    function setDropBusyState(zone, browseBtn, isBusy) {
        zone.classList.toggle("is-busy", isBusy);
        zone.setAttribute("aria-busy", isBusy ? "true" : "false");
        if (browseBtn) {
            browseBtn.disabled = isBusy;
        }
    }

    function updateFeedbackElement(element, message, variant) {
        if (!element) {
            return;
        }
        element.textContent = message || "";
        if (variant) {
            element.dataset.variant = variant;
        } else {
            delete element.dataset.variant;
        }
    }

    function filterJsonFiles(files) {
        return files.filter((file) => {
            const path = normalizePath(getRelativePath(file));
            return path.toLowerCase().endsWith(".json");
        });
    }

    function renderModelSummary(target, files) {
        if (!target) {
            return;
        }
        if (!files.length) {
            target.textContent = "";
            return;
        }
        const keys = Array.from(new Set(files.map(deriveModelKeyFromFile)));
        const sample = keys.slice(0, 3).join(", ");
        const suffix = keys.length > 3 ? ", ..." : "";
        target.textContent = `${keys.length} arquivo${keys.length === 1 ? "" : "s"} .json detectado${keys.length === 1 ? "" : "s"} — ${sample}${suffix}`;
    }

    function deriveModelKeyFromFile(file) {
        const relativePath = normalizePath(getRelativePath(file));
        return getModelFileKey(relativePath || file.name);
    }

    function getModelFileKey(path = "") {
        if (!path) {
            return "";
        }
        const segments = path.split("/").filter(Boolean);
        if (!segments.length) {
            return "";
        }
        const itemIndex = segments.lastIndexOf("item");
        if (itemIndex !== -1 && itemIndex < segments.length - 1) {
            return segments.slice(itemIndex + 1).join("/");
        }
        return segments[segments.length - 1];
    }

    async function parseModelFiles(files) {
        const map = new Map();
        const errors = [];

        for (const file of files) {
            const key = deriveModelKeyFromFile(file);
            if (!key) {
                continue;
            }

            try {
                const text = await file.text();
                const json = JSON.parse(text);
                map.set(key, { json });
            } catch (error) {
                errors.push({
                    key,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return { map, errors };
    }

    function buildModelMerge(additionMap, baseMap) {
        const changedFiles = [];
        const stats = {
            merged: 0,
            created: 0,
            overridesAdded: 0,
        };
        let skippedCount = 0;

        for (const [key, addition] of additionMap.entries()) {
            const base = baseMap.get(key);

            if (base) {
                const mergeOutcome = mergeModelOverrides(base.json, addition.json);
                if (mergeOutcome.addedCount > 0) {
                    stats.merged += 1;
                    stats.overridesAdded += mergeOutcome.addedCount;
                    changedFiles.push({
                        key,
                        jsonText: JSON.stringify(mergeOutcome.json, null, 2),
                        isNew: false,
                        addedCount: mergeOutcome.addedCount,
                        startValue: mergeOutcome.startValue,
                        endValue: mergeOutcome.endValue,
                    });
                } else {
                    skippedCount += 1;
                }
            } else {
                const jsonClone = JSON.parse(JSON.stringify(addition.json));
                const addedCount = countOverridesInJson(jsonClone);
                stats.created += 1;
                stats.overridesAdded += addedCount;
                changedFiles.push({
                    key,
                    jsonText: JSON.stringify(jsonClone, null, 2),
                    isNew: true,
                    addedCount,
                });
            }
        }

        return { changedFiles, stats, skippedCount };
    }

    function mergeModelOverrides(baseJson, additionJson) {
        const merged = JSON.parse(JSON.stringify(baseJson || {}));
        const baseOverrides = Array.isArray(merged.overrides) ? merged.overrides.filter(Boolean) : [];
        const additionOverrides = Array.isArray(additionJson?.overrides) ? additionJson.overrides.filter(Boolean) : [];

        let currentMax = null;
        for (const override of baseOverrides) {
            const value = getCustomModelDataValue(override);
            if (typeof value === "number") {
                currentMax = currentMax === null ? value : Math.max(currentMax, value);
            }
        }

        const startValue = currentMax === null ? 1 : currentMax + 1;
        let nextValue = startValue;
        const appended = [];

        for (const rawOverride of additionOverrides) {
            const normalized = normalizeModelOverride(rawOverride);
            if (!normalized.model) {
                continue;
            }
            normalized.predicate.custom_model_data = nextValue;
            appended.push({
                custom_model_data: nextValue,
                model: normalized.model,
            });
            baseOverrides.push(normalized);
            nextValue += 1;
        }

        if (!appended.length) {
            return {
                json: merged,
                addedCount: 0,
                startValue: null,
                endValue: null,
            };
        }

        baseOverrides.sort((a, b) => {
            const aValue = getCustomModelDataValue(a) ?? 0;
            const bValue = getCustomModelDataValue(b) ?? 0;
            return aValue - bValue;
        });

        merged.overrides = baseOverrides;

        return {
            json: merged,
            addedCount: appended.length,
            startValue: appended[0].custom_model_data,
            endValue: appended[appended.length - 1].custom_model_data,
        };
    }

    function normalizeModelOverride(rawOverride) {
        const clone = JSON.parse(JSON.stringify(rawOverride || {}));
        if (!clone.predicate || typeof clone.predicate !== "object") {
            clone.predicate = {};
        }
        return clone;
    }

    function getCustomModelDataValue(override) {
        if (!override || typeof override !== "object") {
            return null;
        }
        const predicate = override.predicate;
        if (!predicate || typeof predicate !== "object") {
            return null;
        }
        const value = predicate.custom_model_data;
        return typeof value === "number" ? value : null;
    }

    function countOverridesInJson(json) {
        if (!json || typeof json !== "object") {
            return 0;
        }
        return Array.isArray(json.overrides) ? json.overrides.length : 0;
    }

    async function buildModelZip(files) {
        if (typeof JSZip === "undefined") {
            throw new Error("JSZip não está disponível.");
        }
        const zip = new JSZip();
        const root = zip.folder("minecraft").folder("models").folder("item");

        for (const file of files) {
            root.file(file.key, file.jsonText);
        }

        return zip.generateAsync({ type: "blob" });
    }

    function triggerZipDownload(blob) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const dateStamp = new Date().toISOString().split("T")[0];
        anchor.href = url;
        anchor.download = `erisia-modeldata-${dateStamp}.zip`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function renderPreviewList(container, files) {
        if (!container) {
            return;
        }

        container.innerHTML = "";
        files.forEach((file, index) => {
            const details = document.createElement("details");
            details.open = files.length <= 3 && index === 0;

            const summary = document.createElement("summary");
            summary.textContent = file.isNew
                ? `${file.key} • novo arquivo (${file.addedCount} override${file.addedCount === 1 ? "" : "s"})`
                : `${file.key} • +${file.addedCount} override${file.addedCount === 1 ? "" : "s"} (CMD ${file.startValue} → ${file.endValue})`;

            const pre = document.createElement("pre");
            pre.textContent = file.jsonText;

            details.append(summary, pre);
            container.append(details);
        });
    }

    function formatModelSummary(stats, changedCount, skippedCount) {
        const parts = [];
        parts.push(`${changedCount} arquivo${changedCount === 1 ? "" : "s"} pronto${changedCount === 1 ? "" : "s"}`);
        if (stats.merged) {
            parts.push(`${stats.merged} mesclado${stats.merged === 1 ? "" : "s"}`);
        }
        if (stats.created) {
            parts.push(`${stats.created} novo${stats.created === 1 ? "" : "s"}`);
        }
        parts.push(`${stats.overridesAdded} override${stats.overridesAdded === 1 ? "" : "s"} adicionad${stats.overridesAdded === 1 ? "o" : "os"}`);
        if (skippedCount) {
            parts.push(`${skippedCount} sem alterações`);
        }
        return parts.join(" · ");
    }
}
