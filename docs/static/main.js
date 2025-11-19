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

            const zipBlob = await buildModelZip({
                changedFiles: mergeResult.changedFiles,
                baseMap: baseParse.map,
            });
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
                // For texture optimizer, accept .bbmodel files
                const isTextureOptimizer = zone.id === "texture-models-drop";
                const acceptedFiles = isTextureOptimizer 
                    ? files.filter(f => f.name.toLowerCase().endsWith('.bbmodel'))
                    : filterJsonFiles(files);
                
                await onFiles({
                    jsonFiles: acceptedFiles,
                    ignoredCount: files.length - acceptedFiles.length,
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
                map.set(key, { json, text });
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
            duplicatesSkipped: 0,
        };
        let skippedCount = 0;

        for (const [key, addition] of additionMap.entries()) {
            const base = baseMap.get(key);

            if (base) {
                const mergeOutcome = mergeModelOverrides(base.json, addition.json);
                if (mergeOutcome.addedCount > 0) {
                    stats.merged += 1;
                    stats.overridesAdded += mergeOutcome.addedCount;
                    if (mergeOutcome.duplicateCount) {
                        stats.duplicatesSkipped += mergeOutcome.duplicateCount;
                    }
                    changedFiles.push({
                        key,
                        jsonText: formatModelJson(mergeOutcome.json),
                        isNew: false,
                        addedCount: mergeOutcome.addedCount,
                        startValue: mergeOutcome.startValue,
                        endValue: mergeOutcome.endValue,
                        duplicateCount: mergeOutcome.duplicateCount,
                    });
                } else {
                    skippedCount += 1;
                    stats.duplicatesSkipped += mergeOutcome.duplicateCount;
                }
            } else {
                const jsonClone = JSON.parse(JSON.stringify(addition.json));
                const addedCount = countOverridesInJson(jsonClone);
                const sourceEntry = additionMap.get(key);
                stats.created += 1;
                stats.overridesAdded += addedCount;
                changedFiles.push({
                    key,
                    jsonText: formatModelJson(jsonClone),
                    isNew: true,
                    addedCount,
                    duplicateCount: 0,
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

        const existingModels = new Set(
            baseOverrides
                .map(getOverrideModelPath)
                .filter((modelPath) => !!modelPath)
        );

        const startValue = currentMax === null ? 1 : currentMax + 1;
        let nextValue = startValue;
        const appended = [];
        let duplicateCount = 0;

        for (const rawOverride of additionOverrides) {
            const normalized = normalizeModelOverride(rawOverride);
            const normalizedModel = getOverrideModelPath(normalized);
            if (!normalizedModel) {
                continue;
            }

            if (existingModels.has(normalizedModel)) {
                duplicateCount += 1;
                continue;
            }

            existingModels.add(normalizedModel);
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
                duplicateCount,
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
            duplicateCount,
        };
    }

    function normalizeModelOverride(rawOverride) {
        const clone = JSON.parse(JSON.stringify(rawOverride || {}));
        if (!clone.predicate || typeof clone.predicate !== "object") {
            clone.predicate = {};
        }
        if (typeof clone.model === "string") {
            clone.model = clone.model.trim();
        }
        return clone;
    }

    function getOverrideModelPath(override) {
        if (!override || typeof override !== "object") {
            return "";
        }
        const model = override.model;
        if (typeof model !== "string") {
            return "";
        }
        return model.trim();
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

    async function buildModelZip({ changedFiles, baseMap }) {
        if (typeof JSZip === "undefined") {
            throw new Error("JSZip não está disponível.");
        }
        const zip = new JSZip();
        const root = zip.folder("minecraft").folder("models").folder("item");

        const changedLookup = new Map();
        for (const file of changedFiles) {
            changedLookup.set(file.key, file);
        }

        for (const [key, entry] of baseMap.entries()) {
            const changed = changedLookup.get(key);
            const content = changed ? changed.jsonText : entry.text ?? JSON.stringify(entry.json, null, 2);
            root.file(key, content);
            if (changed) {
                changedLookup.delete(key);
            }
        }

        for (const [key, file] of changedLookup.entries()) {
            root.file(key, file.jsonText);
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
            const duplicateNote = file.duplicateCount
                ? ` · ${file.duplicateCount} duplicado${file.duplicateCount === 1 ? "" : "s"} ignorado${file.duplicateCount === 1 ? "" : "s"}`
                : "";
            summary.textContent = file.isNew
                ? `${file.key} • novo arquivo (${file.addedCount} override${file.addedCount === 1 ? "" : "s"})`
                : `${file.key} • +${file.addedCount} override${file.addedCount === 1 ? "" : "s"} (CMD ${file.startValue} → ${file.endValue})${duplicateNote}`;

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
        if (stats.duplicatesSkipped) {
            parts.push(`${stats.duplicatesSkipped} modelo${stats.duplicatesSkipped === 1 ? "" : "s"} duplicado${stats.duplicatesSkipped === 1 ? "" : "s"}`);
        }
        return parts.join(" · ");
    }

    function formatModelJson(json) {
        const indent = (level) => "    ".repeat(level);
        const lines = ["{"];

        const orderedKeys = [];
        const seen = new Set();
        const preferredOrder = ["parent", "textures", "overrides"];

        for (const key of preferredOrder) {
            if (Object.prototype.hasOwnProperty.call(json, key)) {
                orderedKeys.push(key);
                seen.add(key);
            }
        }

        for (const key of Object.keys(json || {})) {
            if (!seen.has(key)) {
                orderedKeys.push(key);
                seen.add(key);
            }
        }

        orderedKeys.forEach((key, index) => {
            const value = json[key];
            if (value === undefined) {
                return;
            }

            let formattedValue;
            if (key === "overrides" && Array.isArray(value)) {
                formattedValue = formatOverridesArray(value, 1);
            } else if (isPlainObject(value)) {
                formattedValue = formatMultilineObject(value, 1);
            } else {
                formattedValue = JSON.stringify(value);
            }

            const suffix = index < orderedKeys.length - 1 ? "," : "";
            lines.push(`${indent(1)}"${key}": ${formattedValue}${suffix}`);
        });

        lines.push("}");
        return lines.join("\n");
    }

    function formatMultilineObject(obj, level) {
        const indent = (lvl) => "    ".repeat(lvl);
        const entries = Object.entries(obj || {});
        if (!entries.length) {
            return "{}";
        }

        const lines = ["{"];
        entries.forEach(([key, value], index) => {
            let formattedValue;
            if (isPlainObject(value)) {
                formattedValue = formatMultilineObject(value, level + 1);
            } else {
                formattedValue = JSON.stringify(value);
            }
            const suffix = index < entries.length - 1 ? "," : "";
            lines.push(`${indent(level + 1)}"${key}": ${formattedValue}${suffix}`);
        });
        lines.push(`${indent(level)}}`);
        return lines.join("\n");
    }

    function formatOverridesArray(overrides, level) {
        if (!Array.isArray(overrides) || !overrides.length) {
            return "[]";
        }
        const indent = (lvl) => "    ".repeat(lvl);
        const lines = ["["];

        overrides.forEach((override, index) => {
            const entry = formatOverrideEntry(override);
            const suffix = index < overrides.length - 1 ? "," : "";
            lines.push(`${indent(level + 1)}${entry}${suffix}`);
        });

        lines.push(`${indent(level)}]`);
        return lines.join("\n");
    }

    function formatOverrideEntry(override) {
        const { predicate = {}, ...rest } = override || {};
        const parts = [`"predicate": ${formatInlineObject(predicate)}`];

        const orderedRestKeys = Object.keys(rest).sort((a, b) => {
            if (a === "model") {
                return -1;
            }
            if (b === "model") {
                return 1;
            }
            return a.localeCompare(b);
        });

        orderedRestKeys.forEach((key) => {
            const value = rest[key];
            const formattedValue = isPlainObject(value) ? formatInlineObject(value) : JSON.stringify(value);
            parts.push(`"${key}": ${formattedValue}`);
        });

        return `{${parts.join(", ")}}`;
    }

    function formatInlineObject(obj) {
        const entries = Object.entries(obj || {});
        if (!entries.length) {
            return "{}";
        }
        return `{${entries
            .map(([key, value]) => {
                const formattedValue = isPlainObject(value) ? formatInlineObject(value) : JSON.stringify(value);
                return `"${key}": ${formattedValue}`;
            })
            .join(", ")}}`;
    }

    function isPlainObject(value) {
        return Object.prototype.toString.call(value) === "[object Object]";
    }
}

// ============================================================================
// Texture Optimizer System
// ============================================================================

const textureOptimizerSection = document.getElementById("texture-optimizer");
if (textureOptimizerSection) {
    const modelsDrop = document.getElementById("texture-models-drop");
    const modelsInput = document.getElementById("texture-models-input");
    const modelsBrowseBtn = document.getElementById("texture-models-browse");
    const modelsFeedback = document.getElementById("texture-models-feedback");
    const modelsSummary = document.getElementById("texture-models-summary");
    const optimizeBtn = document.getElementById("texture-optimize-btn");
    const optimizeFeedback = document.getElementById("texture-optimize-feedback");
    const previewSection = document.getElementById("texture-preview");
    const previewContent = document.getElementById("texture-preview-content");
    const previewSummary = document.getElementById("texture-summary");
    const downloadBtn = document.getElementById("texture-download-btn");

    const textureState = {
        modelFiles: [],
        textureMap: new Map(), // path -> ImageData
        textureGroups: new Map(), // similar textures grouped
        atlasBlob: null,
        optimizedModels: [],
    };

    let isProcessingTextures = false;

    setupModelDropZone({
        zone: modelsDrop,
        input: modelsInput,
        browseBtn: modelsBrowseBtn,
        feedbackEl: modelsFeedback,
        async onFiles({ jsonFiles, ignoredCount }) {
            await handleModelFiles(jsonFiles, ignoredCount);
        },
    });

    optimizeBtn?.addEventListener("click", () => {
        void handleTextureOptimization();
    });

    downloadBtn?.addEventListener("click", () => {
        if (!textureState.atlasBlob || !textureState.optimizedModels.length) {
            updateFeedbackElement(optimizeFeedback, "Gere a otimização antes de baixar.", "error");
            return;
        }
        triggerTextureDownload();
    });

    function refreshTextureState() {
        const canOptimize = textureState.modelFiles.length > 0;
        if (optimizeBtn) {
            optimizeBtn.disabled = !canOptimize || isProcessingTextures;
        }
        if (downloadBtn) {
            downloadBtn.disabled = !textureState.atlasBlob || !textureState.optimizedModels.length;
        }
    }

    async function handleModelFiles(bbmodelFiles, ignoredCount) {
        textureState.modelFiles = bbmodelFiles.filter(f => f.name.toLowerCase().endsWith('.bbmodel'));
        
        if (textureState.modelFiles.length === 0) {
            updateFeedbackElement(modelsFeedback, "Nenhum arquivo .bbmodel detectado.", "error");
            if (modelsSummary) modelsSummary.textContent = "";
            textureState.atlasBlob = null;
            textureState.optimizedModels = [];
            if (previewSection) previewSection.hidden = true;
            refreshTextureState();
            return;
        }

        const messageParts = [`${textureState.modelFiles.length} arquivo${textureState.modelFiles.length === 1 ? "" : "s"} .bbmodel carregado${textureState.modelFiles.length === 1 ? "" : "s"}.`];
        if (ignoredCount > 0) {
            messageParts.push(`${ignoredCount} arquivo${ignoredCount === 1 ? "" : "s"} ignorado${ignoredCount === 1 ? "" : "s"}.`);
        }
        updateFeedbackElement(modelsFeedback, messageParts.join(" "), "success");

        if (modelsSummary) {
            const names = textureState.modelFiles.slice(0, 3).map(f => f.name.replace('.bbmodel', '')).join(", ");
            const suffix = textureState.modelFiles.length > 3 ? ", ..." : "";
            modelsSummary.textContent = `${textureState.modelFiles.length} modelo${textureState.modelFiles.length === 1 ? "" : "s"} — ${names}${suffix}`;
        }

        updateFeedbackElement(optimizeFeedback, "", "");
        textureState.atlasBlob = null;
        textureState.optimizedModels = [];
        if (previewSection) previewSection.hidden = true;
        refreshTextureState();
    }

    async function handleTextureOptimization() {
        if (isProcessingTextures || !optimizeBtn || textureState.modelFiles.length === 0) {
            return;
        }

        isProcessingTextures = true;
        if (textureOptimizerSection) {
            textureOptimizerSection.setAttribute("aria-busy", "true");
        }
        updateFeedbackElement(optimizeFeedback, "Analisando modelos e texturas...", "info");
        if (previewSection) previewSection.hidden = true;
        refreshTextureState();

        try {
            // Parse all .bbmodel files
            const models = [];
            const texturePaths = new Set();
            
            for (const file of textureState.modelFiles) {
                try {
                    const text = await file.text();
                    const model = JSON.parse(text);
                    models.push({ file, model, name: file.name });
                    
                    // Extract texture paths from model
                    extractTexturePaths(model, texturePaths);
                } catch (error) {
                    console.error(`Erro ao ler ${file.name}:`, error);
                }
            }

            if (models.length === 0) {
                updateFeedbackElement(optimizeFeedback, "Nenhum modelo válido foi encontrado.", "error");
                return;
            }

            updateFeedbackElement(optimizeFeedback, `Carregando ${texturePaths.size} textura${texturePaths.size === 1 ? "" : "s"}...`, "info");

            // Load all textures
            const textureData = await loadTextures(texturePaths, textureState.modelFiles);
            
            updateFeedbackElement(optimizeFeedback, "Detectando texturas duplicadas...", "info");

            // Group similar textures
            const textureGroups = groupSimilarTextures(textureData);
            
            updateFeedbackElement(optimizeFeedback, "Criando atlas de texturas...", "info");

            // Create texture atlas
            const atlasResult = await createTextureAtlas(textureGroups);
            
            updateFeedbackElement(optimizeFeedback, "Atualizando modelos...", "info");

            // Update models with atlas references
            const optimizedModels = updateModelsWithAtlas(models, textureGroups, atlasResult.mapping);
            
            // Create ZIP with optimized models and atlas
            const zipBlob = await createOptimizedZip(optimizedModels, atlasResult.canvas);
            textureState.atlasBlob = zipBlob;
            textureState.optimizedModels = optimizedModels;

            // Render preview
            renderTexturePreview(previewContent, {
                modelsProcessed: models.length,
                texturesOriginal: texturePaths.size,
                texturesUnique: textureGroups.size,
                texturesSaved: texturePaths.size - textureGroups.size,
                atlasSize: `${atlasResult.canvas.width}x${atlasResult.canvas.height}`,
            });

            if (previewSection) previewSection.hidden = false;
            if (previewSummary) {
                previewSummary.textContent = `${models.length} modelo${models.length === 1 ? "" : "s"} otimizado${models.length === 1 ? "" : "s"} · ${textureGroups.size} textura${textureGroups.size === 1 ? "" : "s"} únicas · ${texturePaths.size - textureGroups.size} duplicada${texturePaths.size - textureGroups.size === 1 ? "" : "s"} removida${texturePaths.size - textureGroups.size === 1 ? "" : "s"}`;
            }

            updateFeedbackElement(optimizeFeedback, "Otimização concluída! Revise os resultados abaixo.", "success");
        } catch (error) {
            console.error("Erro ao otimizar texturas:", error);
            updateFeedbackElement(optimizeFeedback, "Erro ao otimizar texturas. Verifique o console para detalhes.", "error");
        } finally {
            isProcessingTextures = false;
            if (textureOptimizerSection) {
                textureOptimizerSection.setAttribute("aria-busy", "false");
            }
            refreshTextureState();
        }
    }

    function extractTexturePaths(model, texturePaths) {
        if (!model || typeof model !== 'object') return;
        
        // Blockbench models store textures in various places
        if (model.textures && typeof model.textures === 'object') {
            for (const key in model.textures) {
                const texture = model.textures[key];
                if (typeof texture === 'string' && texture.trim()) {
                    texturePaths.add(texture.trim());
                }
            }
        }
        
        // Also check elements for texture references
        if (Array.isArray(model.elements)) {
            model.elements.forEach(element => {
                if (element.faces && typeof element.faces === 'object') {
                    for (const faceKey in element.faces) {
                        const face = element.faces[faceKey];
                        if (face && face.texture !== undefined) {
                            const texRef = face.texture;
                            if (typeof texRef === 'number') {
                                // Texture index reference
                                if (model.textures && Array.isArray(model.textures)) {
                                    const tex = model.textures[texRef];
                                    if (typeof tex === 'string') {
                                        texturePaths.add(tex.trim());
                                    }
                                }
                            } else if (typeof texRef === 'string') {
                                texturePaths.add(texRef.trim());
                            }
                        }
                    }
                }
            });
        }
    }

    async function loadTextures(texturePaths, modelFiles) {
        const textureData = new Map();
        const loadedTextures = new Set();
        
        // Create a file map from model files for texture lookup
        const fileMap = new Map();
        for (const modelFile of modelFiles) {
            const relativePath = normalizePath(getRelativePath(modelFile));
            const fileName = relativePath.split('/').pop() || modelFile.name;
            fileMap.set(fileName.toLowerCase(), modelFile);
        }
        
        // Try to load each texture
        for (const texturePath of texturePaths) {
            if (loadedTextures.has(texturePath)) continue;
            
            let textureImage = null;
            let loaded = false;
            
            // Try to load texture as image
            try {
                // First, try to create image from path (if it's a data URL or absolute URL)
                if (texturePath.startsWith('data:') || texturePath.startsWith('http://') || texturePath.startsWith('https://')) {
                    textureImage = await loadImageFromURL(texturePath);
                    loaded = true;
                } else {
                    // Try to find texture file in the dropped files
                    const textureFileName = texturePath.split('/').pop() || texturePath;
                    const textureFile = Array.from(modelFiles).find(f => {
                        const name = (f.webkitRelativePath || f.name || '').toLowerCase();
                        return name.includes(textureFileName.toLowerCase()) || 
                               (name.endsWith('.png') && name.includes(texturePath.toLowerCase().replace(/\.(png|jpg|jpeg)$/i, '')));
                    });
                    
                    if (textureFile) {
                        const url = URL.createObjectURL(textureFile);
                        textureImage = await loadImageFromURL(url);
                        URL.revokeObjectURL(url);
                        loaded = true;
                    }
                }
            } catch (error) {
                console.warn(`Não foi possível carregar textura ${texturePath}:`, error);
            }
            
            // If we couldn't load, create a placeholder
            if (!loaded || !textureImage) {
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#404040';
                ctx.fillRect(0, 0, 64, 64);
                ctx.fillStyle = '#ffffff';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('Missing', 32, 28);
                const shortPath = texturePath.length > 20 ? texturePath.substring(0, 17) + '...' : texturePath;
                ctx.fillText(shortPath, 32, 42);
                
                textureImage = canvas;
            }
            
            // Get image data
            const canvas = document.createElement('canvas');
            canvas.width = textureImage.width || textureImage.naturalWidth || 64;
            canvas.height = textureImage.height || textureImage.naturalHeight || 64;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(textureImage, 0, 0);
            
            const textureInfo = {
                path: texturePath,
                image: canvas,
                width: canvas.width,
                height: canvas.height,
                data: ctx.getImageData(0, 0, canvas.width, canvas.height),
            };
            
            textureData.set(texturePath, textureInfo);
            // Also store in textureState for later use
            textureState.textureMap.set(texturePath, textureInfo);
            
            loadedTextures.add(texturePath);
        }
        
        return textureData;
    }

    function loadImageFromURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    function groupSimilarTextures(textureData) {
        const groups = new Map();
        const processed = new Set();
        
        for (const [path, data] of textureData.entries()) {
            if (processed.has(path)) continue;
            
            // Find similar textures
            const similar = [path];
            processed.add(path);
            
            for (const [otherPath, otherData] of textureData.entries()) {
                if (processed.has(otherPath)) continue;
                
                // Compare textures
                if (areTexturesSimilar(data, otherData)) {
                    similar.push(otherPath);
                    processed.add(otherPath);
                }
            }
            
            // Use the first path as the canonical one
            groups.set(similar[0], similar);
        }
        
        return groups;
    }

    function areTexturesSimilar(texture1, texture2, threshold = 0.95) {
        // Simple comparison: check if images are identical or very similar
        // For production, you'd want more sophisticated image comparison
        
        if (texture1.width !== texture2.width || texture1.height !== texture2.height) {
            return false;
        }
        
        const data1 = texture1.data.data;
        const data2 = texture2.data.data;
        
        if (data1.length !== data2.length) {
            return false;
        }
        
        // Check if images are identical
        let identical = true;
        for (let i = 0; i < data1.length; i += 4) {
            // Compare RGBA values (allow small differences for compression artifacts)
            const diff = Math.abs(data1[i] - data2[i]) +
                        Math.abs(data1[i+1] - data2[i+1]) +
                        Math.abs(data1[i+2] - data2[i+2]) +
                        Math.abs(data1[i+3] - data2[i+3]);
            if (diff > 10) { // Threshold for "identical"
                identical = false;
                break;
            }
        }
        
        if (identical) return true;
        
        // For more sophisticated comparison, you could:
        // 1. Calculate histogram similarity
        // 2. Use perceptual hashing
        // 3. Compare color distributions
        // For now, we'll only group identical textures
        
        return false;
    }

    async function createTextureAtlas(textureGroups) {
        // Calculate atlas size
        let totalArea = 0;
        const textures = [];
        
        // First, we need to ensure textureMap is populated
        // This should have been done in loadTextures, but let's be safe
        if (textureState.textureMap.size === 0) {
            // Re-populate from textureGroups if needed
            for (const [canonicalPath] of textureGroups.entries()) {
                // Try to get from a global texture cache if available
                // For now, we'll need to reload or use placeholder
            }
        }
        
        for (const [canonicalPath, group] of textureGroups.entries()) {
            const textureData = textureState.textureMap.get(canonicalPath);
            if (!textureData) {
                // Create placeholder if missing
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#808080';
                ctx.fillRect(0, 0, 64, 64);
                
                textureData = {
                    path: canonicalPath,
                    image: canvas,
                    width: 64,
                    height: 64,
                    data: ctx.getImageData(0, 0, 64, 64),
                };
                textureState.textureMap.set(canonicalPath, textureData);
            }
            
            textures.push({
                path: canonicalPath,
                group: group,
                width: textureData.width,
                height: textureData.height,
                image: textureData.image,
            });
            
            totalArea += textureData.width * textureData.height;
        }
        
        // Estimate atlas size (add padding)
        const padding = 2;
        const estimatedSize = Math.ceil(Math.sqrt(totalArea * 1.2)); // 20% overhead
        const atlasSize = Math.pow(2, Math.ceil(Math.log2(estimatedSize))); // Power of 2
        
        // Create atlas canvas
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(atlasSize, 4096); // Max 4096
        canvas.height = Math.min(atlasSize, 4096);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Pack textures using simple bin packing
        const mapping = new Map(); // original path -> {x, y, width, height, canonical}
        let currentX = padding;
        let currentY = padding;
        let maxHeight = 0;
        
        for (const texture of textures) {
            if (currentX + texture.width + padding > canvas.width) {
                currentX = padding;
                currentY += maxHeight + padding;
                maxHeight = 0;
            }
            
            if (currentY + texture.height + padding > canvas.height) {
                console.warn('Atlas too small, some textures may be cut off');
                break;
            }
            
            // Draw texture to atlas
            ctx.drawImage(texture.image, currentX, currentY);
            
            // Store mapping for all textures in group
            for (const path of texture.group) {
                mapping.set(path, {
                    x: currentX,
                    y: currentY,
                    width: texture.width,
                    height: texture.height,
                    canonical: texture.path,
                });
            }
            
            currentX += texture.width + padding;
            maxHeight = Math.max(maxHeight, texture.height);
        }
        
        return { canvas, mapping, width: canvas.width, height: canvas.height };
    }

    function updateModelsWithAtlas(models, textureGroups, atlasMapping) {
        const optimized = [];
        
        for (const { file, model, name } of models) {
            const optimizedModel = JSON.parse(JSON.stringify(model));
            
            // Update texture references
            if (optimizedModel.textures && typeof optimizedModel.textures === 'object') {
                for (const key in optimizedModel.textures) {
                    const originalPath = optimizedModel.textures[key];
                    if (typeof originalPath === 'string') {
                        const mapping = atlasMapping.get(originalPath.trim());
                        if (mapping) {
                            // Update to use atlas coordinates
                            optimizedModel.textures[key] = `#${key}`; // Use texture variable
                            // Store UV mapping in model metadata or separate file
                        }
                    }
                }
            }
            
            optimized.push({
                name: name,
                model: optimizedModel,
                originalFile: file,
            });
        }
        
        return optimized;
    }

    async function createOptimizedZip(optimizedModels, atlasCanvas) {
        if (typeof JSZip === "undefined") {
            throw new Error("JSZip não está disponível.");
        }
        
        const zip = new JSZip();
        
        // Add optimized models
        const modelsFolder = zip.folder("models");
        for (const optModel of optimizedModels) {
            modelsFolder.file(optModel.name, JSON.stringify(optModel.model, null, 2));
        }
        
        // Add atlas texture
        const texturesFolder = zip.folder("textures");
        return new Promise((resolve, reject) => {
            atlasCanvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Falha ao criar blob do atlas"));
                    return;
                }
                // Convert blob to base64 for JSZip
                const reader = new FileReader();
                reader.onload = () => {
                    texturesFolder.file("atlas.png", reader.result.split(',')[1], { base64: true });
                    zip.generateAsync({ type: "blob" }).then(resolve).catch(reject);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }, 'image/png');
        });
    }

    function triggerTextureDownload() {
        if (!textureState.atlasBlob) return;
        
        const url = URL.createObjectURL(textureState.atlasBlob);
        const anchor = document.createElement("a");
        const dateStamp = new Date().toISOString().split("T")[0];
        anchor.href = url;
        anchor.download = `erisia-textures-optimized-${dateStamp}.zip`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function renderTexturePreview(container, stats) {
        if (!container) return;
        
        container.innerHTML = "";
        
        const statsDiv = document.createElement("div");
        statsDiv.style.cssText = "display: grid; gap: 0.75rem; padding: 1rem; background: rgba(6, 10, 18, 0.9); border: 1px solid rgba(224, 160, 48, 0.25);";
        
        const title = document.createElement("h4");
        title.textContent = "Estatísticas da Otimização";
        title.style.cssText = "margin: 0 0 0.5rem; font-size: clamp(0.7rem, 1.2vw, 0.9rem); color: var(--color-accent-strong);";
        statsDiv.appendChild(title);
        
        const statsList = document.createElement("ul");
        statsList.style.cssText = "margin: 0; padding-left: 1.5rem; list-style: disc;";
        
        const items = [
            `Modelos processados: ${stats.modelsProcessed}`,
            `Texturas originais: ${stats.texturesOriginal}`,
            `Texturas únicas: ${stats.texturesUnique}`,
            `Texturas economizadas: ${stats.texturesSaved}`,
            `Tamanho do atlas: ${stats.atlasSize}`,
        ];
        
        items.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;
            li.style.cssText = "font-size: clamp(0.55rem, 0.95vw, 0.8rem); color: var(--color-muted); margin: 0.25rem 0;";
            statsList.appendChild(li);
        });
        
        statsDiv.appendChild(statsList);
        container.appendChild(statsDiv);
        
        // Add note about texture loading
        const note = document.createElement("p");
        note.textContent = "Nota: Para carregar texturas reais, forneça os arquivos de textura junto com os modelos ou configure o caminho das texturas.";
        note.style.cssText = "margin: 1rem 0 0; padding: 0.75rem; background: rgba(224, 160, 48, 0.1); border-left: 3px solid var(--color-accent); font-size: clamp(0.5rem, 0.85vw, 0.7rem); color: var(--color-muted);";
        container.appendChild(note);
    }

    refreshTextureState();
}
