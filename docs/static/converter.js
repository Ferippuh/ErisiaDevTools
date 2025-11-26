// Conversor Nexo/Oraxen para ItemsAdder
const converterDropZone = document.getElementById("converter-drop-zone");
const converterBrowseBtn = document.getElementById("converter-browse-btn");
const converterDirectoryPicker = document.getElementById("converter-directory-picker");
const converterFeedback = document.getElementById("converter-feedback");
const converterResult = document.getElementById("converter-result");
const converterSourceInfo = document.getElementById("converter-source-info");
const converterFileCount = document.getElementById("converter-file-count");
const converterDownloadBtn = document.getElementById("converter-download-btn");
const converterSummary = document.getElementById("converter-summary");

let convertedFiles = null;
let isConverting = false;

converterBrowseBtn.addEventListener("click", () => converterDirectoryPicker.click());
converterDirectoryPicker.addEventListener("change", async (event) => {
    const files = [...event.target.files];
    await processConverterFiles(files);
    converterDirectoryPicker.value = "";
});

converterDropZone.addEventListener("click", (event) => {
    if (event.target === converterDropZone || event.target.closest(".drop-zone__content")) {
        converterDirectoryPicker.click();
    }
});

converterDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        converterDirectoryPicker.click();
    }
});

converterDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    converterDropZone.classList.add("is-dragover");
});

converterDropZone.addEventListener("dragleave", (event) => {
    if (!converterDropZone.contains(event.relatedTarget)) {
        converterDropZone.classList.remove("is-dragover");
    }
});

converterDropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    converterDropZone.classList.remove("is-dragover");

    const dataTransfer = event.dataTransfer;
    const files = await extractFilesFromDataTransfer(dataTransfer);
    await processConverterFiles(files);
});

converterDownloadBtn.addEventListener("click", async () => {
    if (!convertedFiles) {
        showConverterFeedback("Nada para baixar ainda.", "error");
        return;
    }

    try {
        showConverterFeedback("Criando arquivo ZIP...", "info");
        const zip = new JSZip();
        
        // Adicionar arquivos convertidos
        for (const [path, content] of Object.entries(convertedFiles.files)) {
            zip.file(path, content);
        }

        // Adicionar resource pack se existir
        if (convertedFiles.resourcePack) {
            for (const [path, content] of Object.entries(convertedFiles.resourcePack)) {
                zip.file(path, content);
            }
        }

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `ItemsAdder_${convertedFiles.type}_converted.zip`;
        anchor.click();
        URL.revokeObjectURL(url);
        showConverterFeedback("Download iniciado!", "success");
    } catch (error) {
        console.error("Erro ao criar ZIP:", error);
        showConverterFeedback("Erro ao criar arquivo ZIP.", "error");
    }
});

async function processConverterFiles(files) {
    if (isConverting) {
        return;
    }

    if (!files || !files.length) {
        showConverterFeedback("Nenhum arquivo foi recebido.", "error");
        return;
    }

    isConverting = true;
    setConverterBusyState(true);
    showConverterFeedback("Analisando estrutura da pasta...", "info");
    converterResult.hidden = true;

    try {
        // Detectar tipo (Nexo ou Oraxen) e estrutura
        const structure = analyzeStructure(files);
        
        if (!structure.type) {
            showConverterFeedback("Não foi possível detectar se é Nexo ou Oraxen. Certifique-se de que a pasta contém uma pasta 'items'.", "error");
            return;
        }

        showConverterFeedback(`Detectado: ${structure.type.toUpperCase()}. Convertendo arquivos...`, "info");

        // Converter itens
        const convertedItems = await convertItems(files, structure);
        
        // Processar resource pack se existir
        let resourcePack = null;
        if (structure.hasPack) {
            showConverterFeedback("Processando resource pack...", "info");
            resourcePack = await processResourcePack(files, structure);
        }

        convertedFiles = {
            type: structure.type,
            files: convertedItems,
            resourcePack: resourcePack,
            stats: {
                itemsConverted: Object.keys(convertedItems).length,
                hasResourcePack: !!resourcePack
            }
        };

        // Mostrar resultado
        displayConverterResult(convertedFiles);
        converterResult.hidden = false;
        showConverterFeedback("Conversão concluída com sucesso!", "success");
    } catch (error) {
        console.error("Erro na conversão:", error);
        showConverterFeedback(`Erro durante a conversão: ${error.message}`, "error");
    } finally {
        isConverting = false;
        setConverterBusyState(false);
    }
}

function analyzeStructure(files) {
    const structure = {
        type: null,
        hasItems: false,
        hasPack: false,
        itemsPath: null,
        packPath: null
    };

    // Procurar pasta items
    for (const file of files) {
        const path = getRelativePath(file).toLowerCase();
        
        if (path.includes("/items/") || path.startsWith("items/")) {
            structure.hasItems = true;
            structure.itemsPath = path.split("/items/")[0] || "";
            
            // Detectar tipo baseado no caminho
            if (path.includes("/nexo/") || path.startsWith("nexo/")) {
                structure.type = "nexo";
            } else if (path.includes("/oraxen/") || path.startsWith("oraxen/")) {
                structure.type = "oraxen";
            } else {
                // Tentar detectar pelo conteúdo ou estrutura
                // Por padrão, assumir Oraxen (mais comum)
                structure.type = "oraxen";
            }
            break;
        }
    }

    // Procurar pasta pack
    for (const file of files) {
        const path = getRelativePath(file).toLowerCase();
        if (path.includes("/pack/") || path.startsWith("pack/")) {
            structure.hasPack = true;
            structure.packPath = path.split("/pack/")[0] || "";
            break;
        }
    }

    return structure;
}

async function convertItems(files, structure) {
    const converted = {};
    const itemsFiles = files.filter(f => {
        const path = getRelativePath(f).toLowerCase();
        return (path.includes("/items/") || path.startsWith("items/")) && 
               f.name.endsWith(".yml") || f.name.endsWith(".yaml");
    });

    for (const file of itemsFiles) {
        try {
            const text = await file.text();
            const sourceConfig = jsyaml.load(text);
            
            if (!sourceConfig) continue;

            const outputConfig = {
                info: {
                    namespace: structure.type,
                    converted_from: structure.type
                },
                items: {}
            };

            // Converter usando o conversor apropriado
            if (structure.type === "oraxen") {
                convertOraxenItems(sourceConfig, outputConfig.items, file.name);
            } else {
                convertNexoItems(sourceConfig, outputConfig.items, file.name);
            }

            // Determinar caminho de saída
            const relativePath = getRelativePath(file);
            const itemsIndex = relativePath.toLowerCase().indexOf("/items/");
            const fileName = file.name;
            const outputPath = `ItemsAdder/contents/${structure.type}/${fileName}`;

            converted[outputPath] = jsyaml.dump(outputConfig, { 
                lineWidth: -1,
                quotingType: '"',
                forceQuotes: false
            });
        } catch (error) {
            console.warn(`Erro ao converter ${file.name}:`, error);
        }
    }

    return converted;
}

function convertOraxenItems(sourceConfig, outputItems, fileName) {
    // Obter seção de itens do source
    const sourceItems = sourceConfig.items || sourceConfig;
    
    for (const [itemId, itemData] of Object.entries(sourceItems)) {
        if (typeof itemData !== "object" || !itemData) continue;

        const convertedItem = {};
        
        // Mapeamentos básicos
        mapField(itemData, convertedItem, ["customname", "displayname", "itemname"], "name");
        mapField(itemData, convertedItem, "lore", "lore");
        mapField(itemData, convertedItem, "permission", "permission_suffix");
        mapField(itemData, convertedItem, "unbreakable", "durability.unbreakable");
        mapField(itemData, convertedItem, "ItemFlags", "item_flags");
        mapField(itemData, convertedItem, "Enchantments", "enchantments");
        mapField(itemData, convertedItem, "hide_tooltip", "hide_tooltip");
        mapField(itemData, convertedItem, "enchantment_glint_override", "glint");

        // Pack/Resource
        if (itemData.Pack) {
            convertedItem.resource = convertPack(itemData.Pack, itemData.material || "PAPER", true);
        } else if (itemData.material) {
            convertedItem.resource = {
                material: itemData.material,
                generate: true
            };
        }

        // Custom Model Data
        if (itemData.Pack?.custom_model_data !== undefined) {
            if (!convertedItem.resource) convertedItem.resource = {};
            convertedItem.resource.custom_model_data = itemData.Pack.custom_model_data;
        }

        // Attribute Modifiers
        if (itemData.AttributeModifiers) {
            convertedItem.attribute_modifiers = convertAttributeModifiers(itemData.AttributeModifiers);
        }

        // Furniture
        if (itemData.Mechanics?.furniture) {
            if (!convertedItem.behaviours) convertedItem.behaviours = {};
            convertedItem.behaviours.furniture = convertFurniture(itemData.Mechanics.furniture, itemData);
        }

        // Consumable/Food
        if (itemData.food || itemData.consumable) {
            convertedItem.consumable = convertConsumable(itemData.food, itemData.consumable);
        }

        // Durability
        if (itemData.Components?.durability !== undefined) {
            const durability = itemData.Components.durability?.value ?? itemData.Components.durability;
            if (typeof durability === "number") {
                convertedItem.durability = { max_durability: durability };
            }
        }

        // Template/Variant
        if (itemData.template !== undefined) {
            if (typeof itemData.template === "string") {
                convertedItem.variant_of = itemData.template;
            } else if (typeof itemData.template === "boolean") {
                convertedItem.template = itemData.template;
            }
        }

        // Disable Enchanting
        if (itemData.disable_enchanting) {
            convertedItem.blocked_enchants = ["all"];
        }

        // Equippable
        if (itemData.Pack?.Components?.equippable) {
            convertedItem.equippable = convertEquippable(itemData.Pack.Components.equippable);
        }

        // Use Cooldown
        if (itemData.use_cooldown) {
            if (!convertedItem.events_settings) convertedItem.events_settings = {};
            convertedItem.events_settings.cooldown = {
                indicator: "VANILLA",
                ticks: Math.round((itemData.use_cooldown.seconds || 1.0) * 20)
            };
        }

        // Big Mining
        if (itemData.Mechanics?.bigmining) {
            if (!convertedItem.events) convertedItem.events = {};
            if (!convertedItem.events.block_break) convertedItem.events.block_break = {};
            convertedItem.events.block_break.multiple_break = {
                size: itemData.Mechanics.bigmining.radius || 1,
                depth: itemData.Mechanics.bigmining.depth || 1,
                drop_all_blocks: {
                    enabled: true
                }
            };
        }

        outputItems[itemId] = convertedItem;
    }
}

function convertNexoItems(sourceConfig, outputItems, fileName) {
    // Similar ao Oraxen, mas com algumas diferenças
    const sourceItems = sourceConfig.items || sourceConfig;
    
    for (const [itemId, itemData] of Object.entries(sourceItems)) {
        if (typeof itemData !== "object" || !itemData) continue;

        const convertedItem = {};
        
        // Mapeamentos básicos (mesmos do Oraxen)
        mapField(itemData, convertedItem, ["customname", "displayname", "itemname"], "name");
        mapField(itemData, convertedItem, "lore", "lore");
        mapField(itemData, convertedItem, "permission", "permission_suffix");
        mapField(itemData, convertedItem, "unbreakable", "durability.unbreakable");
        mapField(itemData, convertedItem, "ItemFlags", "item_flags");
        mapField(itemData, convertedItem, "Enchantments", "enchantments");
        mapField(itemData, convertedItem, "hide_tooltip", "hide_tooltip");
        mapField(itemData, convertedItem, "enchantment_glint_override", "glint");

        // Pack/Resource
        if (itemData.Pack) {
            convertedItem.resource = convertPack(itemData.Pack, itemData.material || "PAPER", false);
        }

        // Custom Model Data
        if (itemData.Pack?.custom_model_data !== undefined) {
            if (!convertedItem.resource) convertedItem.resource = {};
            convertedItem.resource.custom_model_data = itemData.Pack.custom_model_data;
        }

        // Attribute Modifiers
        if (itemData.AttributeModifiers) {
            convertedItem.attribute_modifiers = convertAttributeModifiers(itemData.AttributeModifiers);
        }

        // Furniture
        if (itemData.Mechanics?.furniture) {
            if (!convertedItem.behaviours) convertedItem.behaviours = {};
            convertedItem.behaviours.furniture = convertFurniture(itemData.Mechanics.furniture, itemData);
        }

        // Consumable/Food
        if (itemData.food || itemData.consumable) {
            convertedItem.consumable = convertConsumable(itemData.food, itemData.consumable);
        }

        // Durability (Nexo usa formato diferente)
        if (itemData.durability !== undefined) {
            const durability = itemData.durability?.value ?? itemData.durability;
            if (typeof durability === "number") {
                convertedItem.durability = { max_custom_durability: durability };
            }
        }

        // Template/Variant
        if (itemData.template !== undefined) {
            if (typeof itemData.template === "string") {
                convertedItem.variant_of = itemData.template;
            } else if (typeof itemData.template === "boolean") {
                convertedItem.template = itemData.template;
            }
        }

        // Disable Enchanting
        if (itemData.disable_enchanting) {
            convertedItem.blocked_enchants = ["all"];
        }

        // Equippable
        if (itemData.Pack?.Components?.equippable) {
            convertedItem.equippable = convertEquippable(itemData.Pack.Components.equippable);
        }

        // Use Cooldown
        if (itemData.use_cooldown) {
            if (!convertedItem.events_settings) convertedItem.events_settings = {};
            convertedItem.events_settings.cooldown = {
                indicator: "VANILLA",
                ticks: Math.round((itemData.use_cooldown.seconds || 1.0) * 20)
            };
        }

        outputItems[itemId] = convertedItem;
    }
}

function convertPack(pack, material, isOraxen) {
    const resource = {
        material: material || "PAPER"
    };

    if (isOraxen) {
        if (pack.generate_model === false) {
            resource.generate = false;
            if (pack.model) {
                resource.model_path = sanitizeNamespacedString(pack.model);
            }
        } else {
            resource.generate = true;
            
            if (pack.texture && typeof pack.texture === "string") {
                resource.texture = sanitizeNamespacedString(pack.texture);
            } else if (pack.textures && Array.isArray(pack.textures)) {
                const parentModel = pack.parent_model || "";
                const textures = convertTexturesForParentModel(pack.textures, parentModel, pack.texture);
                
                if (textures.length === 1) {
                    resource.texture = textures[0];
                } else {
                    resource.textures = textures;
                }
                if (parentModel) {
                    resource.parent = parentModel;
                }
            }
        }
    } else {
        // Nexo
        if (pack.model_path) {
            resource.generate = false;
            resource.model_path = pack.model_path;
            if (pack.parent_model) {
                resource.parent = pack.parent_model;
            }
        } else {
            resource.generate = true;
            
            if (pack.texture && typeof pack.texture === "string") {
                resource.texture = pack.texture;
            } else if (pack.textures && Array.isArray(pack.textures)) {
                resource.textures = pack.textures;
            } else {
                // Tentar converter baseado no parent_model
                const parentModel = pack.parent_model || "";
                const textures = convertNexoTextures(pack, parentModel);
                if (textures.length > 0) {
                    if (textures.length === 1) {
                        resource.texture = textures[0];
                    } else {
                        resource.textures = textures;
                    }
                }
            }
        }
    }

    return resource;
}

function convertTexturesForParentModel(textures, parentModel, defaultTexture) {
    const defaultTex = defaultTexture || (textures.length > 0 ? textures[0] : "block/missing_texture");
    
    const getTex = (index, def) => index < textures.length ? textures[index] : def;
    
    switch (parentModel) {
        case "block/cube":
        case "block/cube_directional":
        case "block/cube_mirrored":
            return [
                getTex(2, defaultTex), // down
                getTex(4, defaultTex), // east
                getTex(2, defaultTex), // north
                getTex(3, defaultTex), // south
                getTex(1, defaultTex), // up
                getTex(5, defaultTex)  // west
            ];
        case "block/cube_all":
        case "block/cube_mirrored_all":
            return Array(6).fill(defaultTex);
        case "block/cube_top":
            return [
                getTex(1, defaultTex), // down
                getTex(1, defaultTex), // east
                getTex(1, defaultTex), // north
                getTex(1, defaultTex), // south
                getTex(0, defaultTex), // up
                getTex(1, defaultTex)  // west
            ];
        case "block/cube_bottom_top":
            return [
                getTex(2, defaultTex), // down
                getTex(1, defaultTex), // east
                getTex(1, defaultTex), // north
                getTex(1, defaultTex), // south
                getTex(0, defaultTex), // up
                getTex(1, defaultTex)  // west
            ];
        case "block/orientable":
        case "block/orientable_with_bottom":
        case "block/orientable_vertical":
            const front = getTex(0, defaultTex);
            const side = getTex(1, defaultTex);
            const top = getTex(2, defaultTex);
            const bottom = getTex(3, defaultTex);
            return [
                parentModel.endsWith("with_bottom") ? bottom : side, // down
                side, // east
                side, // north
                front, // south
                !parentModel.endsWith("vertical") ? top : front, // up
                side  // west
            ];
        case "block/cube_column":
            return [
                getTex(0, defaultTex), // down (end)
                getTex(1, defaultTex), // east (side)
                getTex(1, defaultTex), // north
                getTex(1, defaultTex), // south
                getTex(0, defaultTex), // up (end)
                getTex(1, defaultTex)  // west
            ];
        default:
            return textures.length > 0 ? textures : [defaultTex];
    }
}

function convertNexoTextures(pack, parentModel) {
    const textures = [];
    
    switch (parentModel) {
        case "block/cube_top":
            if (pack.textures?.top && pack.textures?.side) {
                return [
                    pack.textures.side, // down
                    pack.textures.side, // east
                    pack.textures.side, // north
                    pack.textures.side, // south
                    pack.textures.top,  // up
                    pack.textures.side  // west
                ];
            }
            break;
        case "block/cube_all":
            if (pack.texture) {
                return Array(6).fill(pack.texture);
            }
            break;
        case "block/cube_column":
            if (pack.textures?.side && pack.textures?.end) {
                return [
                    pack.textures.end,   // down
                    pack.textures.side,  // east
                    pack.textures.side,  // north
                    pack.textures.side,  // south
                    pack.textures.end,   // up
                    pack.textures.side   // west
                ];
            }
            break;
    }
    
    return textures;
}

function sanitizeNamespacedString(str) {
    if (!str || typeof str !== "string") return str;
    if (!str.includes(":")) {
        return "minecraft:" + str;
    }
    return str;
}

function convertAttributeModifiers(modifiers) {
    if (!Array.isArray(modifiers)) return null;
    
    const slotMap = {};
    
    for (const entry of modifiers) {
        if (typeof entry !== "object") continue;
        
        const attr = entry.attribute?.toLowerCase().replace("generic_", "");
        const amount = entry.amount;
        const op = entry.operation ?? 0;
        const slot = (entry.slot || "HAND").toLowerCase();
        
        if (!attr || typeof amount !== "number") continue;
        
        const operation = op === 0 ? "add" : op === 1 ? "multiply" : op === 2 ? "multiply_base" : null;
        const slotName = slot === "hand" || slot === "mainhand" ? "mainhand" :
                        slot === "offhand" ? "offhand" :
                        slot === "feet" ? "feet" :
                        slot === "legs" ? "legs" :
                        slot === "chest" ? "chest" :
                        slot === "head" ? "head" : null;
        
        if (!slotName || !operation) continue;
        
        if (!slotMap[slotName]) slotMap[slotName] = {};
        slotMap[slotName][attr] = {
            operation: operation,
            value: amount
        };
    }
    
    return Object.keys(slotMap).length > 0 ? slotMap : null;
}

function convertFurniture(furniture, itemData) {
    const result = {};
    
    if (itemData.rotatable !== undefined) {
        result.fixed_rotation = !itemData.rotatable;
    }
    
    if (itemData.limited_placing) {
        if (itemData.limited_placing.roof !== undefined) {
            if (!result.placeable_on) result.placeable_on = {};
            result.placeable_on.ceiling = itemData.limited_placing.roof;
        }
        if (itemData.limited_placing.floor !== undefined) {
            if (!result.placeable_on) result.placeable_on = {};
            result.placeable_on.floor = itemData.limited_placing.floor;
        }
        if (itemData.limited_placing.wall !== undefined) {
            if (!result.placeable_on) result.placeable_on = {};
            result.placeable_on.walls = itemData.limited_placing.wall;
        }
    }
    
    // Entity type
    if (itemData.type) {
        const type = itemData.type.toLowerCase();
        if (type === "display_entity" || type === "item_display") {
            result.entity = "item_display";
        } else if (type === "armor_stand") {
            result.entity = "armor_stand";
        } else if (type === "item_frame") {
            result.entity = "item_frame";
        }
    } else {
        result.entity = "item_display"; // Default
    }
    
    // Display transform
    if (itemData.display_entity_properties?.display_transform) {
        result.display_transformation = {
            transform: itemData.display_entity_properties.display_transform
        };
    }
    
    // Block sounds
    if (furniture.block_sounds) {
        result.sound = {};
        if (furniture.block_sounds.place_sound) {
            result.sound.place = {
                name: furniture.block_sounds.place_sound,
                volume: 0,
                pitch: 0
            };
        }
        if (furniture.block_sounds.break_sound) {
            result.sound.break = {
                name: furniture.block_sounds.break_sound,
                volume: 0,
                pitch: 0
            };
        }
    }
    
    // Lights
    if (furniture.lights && Array.isArray(furniture.lights)) {
        let maxLevel = 0;
        for (const light of furniture.lights) {
            if (typeof light === "string") {
                const parts = light.split(/\s+/);
                if (parts.length >= 4) {
                    const level = parseInt(parts[3]);
                    if (!isNaN(level)) {
                        maxLevel = Math.max(maxLevel, level);
                    }
                }
            }
        }
        if (maxLevel > 0) {
            result.light_level = maxLevel;
        }
    }
    
    return result;
}

function convertConsumable(food, consumable) {
    const result = {};
    
    if (food) {
        if (food.nutrition !== undefined) result.nutrition = food.nutrition;
        if (food.saturation !== undefined) result.saturation = food.saturation;
        if (food.can_always_eat !== undefined) result.can_always_eat = food.can_always_eat;
    }
    
    if (consumable) {
        if (consumable.sound) result.sound = consumable.sound;
        if (consumable.consume_particles !== undefined) result.particles = consumable.consume_particles;
        if (consumable.consume_seconds !== undefined) result.consume_seconds = consumable.consume_seconds;
        
        if (consumable.animation) {
            const anim = consumable.animation.toLowerCase();
            result.animation = anim === "block" ? "block" : anim === "drink" ? "drink" : "eat";
        }
        
        if (consumable.effects) {
            result.effects = convertConsumableEffects(consumable.effects);
        }
    }
    
    return Object.keys(result).length > 0 ? result : null;
}

function convertConsumableEffects(effects) {
    const result = {};
    
    if (effects.APPLY_EFFECTS) {
        result.apply_status_effects = {
            probability: 1,
            effects: {}
        };
        
        let id = 1;
        for (const [effectName, effectData] of Object.entries(effects.APPLY_EFFECTS)) {
            if (typeof effectData === "object") {
                result.apply_status_effects.effects[`effect_${id++}`] = {
                    potion: effectName.toUpperCase(),
                    duration: effectData.duration ?? 20,
                    amplifier: effectData.amplifier ?? 0,
                    ambient: effectData.ambient ?? false,
                    particles: effectData.particles !== false,
                    icon: effectData.icon !== false
                };
            }
        }
    }
    
    if (effects.REMOVE_EFFECTS && Array.isArray(effects.REMOVE_EFFECTS)) {
        result.remove_status_effects = {
            effects: effects.REMOVE_EFFECTS.map(e => e.toUpperCase())
        };
    }
    
    if (effects.CLEAR_ALL_EFFECTS) {
        result.clear_status_effects = true;
    }
    
    if (effects.TELEPORT_RANDOMLY) {
        result.teleport_randomly = {
            diameter: effects.TELEPORT_RANDOMLY.diameter ?? 5.0
        };
    }
    
    if (effects.PLAY_SOUND) {
        result.play_sound = {
            sound: effects.PLAY_SOUND.sound || "entity.generic.eat"
        };
    }
    
    return Object.keys(result).length > 0 ? result : null;
}

function convertEquippable(equippable) {
    const result = {};
    
    if (equippable.slot) result.slot = equippable.slot;
    if (equippable.model) result.id = equippable.model;
    if (equippable.camera_overlay) result.camera_overlay = equippable.camera_overlay;
    if (equippable.equip_sound) result.equip_sound = equippable.equip_sound;
    if (equippable.allowed_entities) result.allowed_entities = equippable.allowed_entities;
    if (equippable.dispensable !== undefined) result.dispensable = equippable.dispensable;
    if (equippable.swappable !== undefined) result.swappable = equippable.swappable;
    if (equippable.damage_on_hurt !== undefined) result.damage_on_hurt = equippable.damage_on_hurt;
    
    return Object.keys(result).length > 0 ? result : null;
}

function mapField(source, dest, sourcePath, destPath) {
    if (Array.isArray(sourcePath)) {
        for (const path of sourcePath) {
            if (source[path] !== undefined) {
                setNestedValue(dest, destPath, source[path]);
                return;
            }
        }
    } else {
        if (source[sourcePath] !== undefined) {
            setNestedValue(dest, destPath, source[sourcePath]);
        }
    }
}

function setNestedValue(obj, path, value) {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

async function processResourcePack(files, structure) {
    const resourcePack = {};
    const validAssetsFolders = ["models", "textures", "font", "lang", "blockstates", "shaders", "equipment", "items", "particles", "post_effect", "texts", "atlases"];
    
    // Filtrar arquivos do pack
    const packFiles = files.filter(f => {
        const path = getRelativePath(f).toLowerCase();
        return path.includes("/pack/") || path.startsWith("pack/");
    });
    
    for (const file of packFiles) {
        const relativePath = getRelativePath(file);
        const pathParts = relativePath.toLowerCase().split("/pack/");
        
        if (pathParts.length < 2) continue;
        
        const afterPack = pathParts[1];
        
        // Verificar se está em assets/minecraft ou assets/[namespace]
        if (afterPack.startsWith("assets/minecraft/")) {
            const assetPath = afterPack.replace("assets/minecraft/", "");
            const firstPart = assetPath.split("/")[0];
            
            if (validAssetsFolders.includes(firstPart)) {
                const outputPath = `ItemsAdder/contents/${structure.type}/resource_pack/assets/minecraft/${assetPath}`;
                resourcePack[outputPath] = await file.arrayBuffer();
            }
        } else if (afterPack.startsWith("assets/")) {
            // Outros namespaces
            const outputPath = `ItemsAdder/contents/${structure.type}/resource_pack/${afterPack}`;
            resourcePack[outputPath] = await file.arrayBuffer();
        }
    }
    
    return Object.keys(resourcePack).length > 0 ? resourcePack : null;
}

function displayConverterResult(result) {
    converterSourceInfo.textContent = `Tipo detectado: ${result.type.toUpperCase()}`;
    converterFileCount.textContent = `${result.stats.itemsConverted} itens convertidos${result.stats.hasResourcePack ? " + Resource Pack" : ""}`;
    
    const summary = document.createElement("div");
    summary.className = "converter-summary-content";
    summary.innerHTML = `
        <h4>Resumo da conversão:</h4>
        <ul>
            <li><strong>Plugin origem:</strong> ${result.type.toUpperCase()}</li>
            <li><strong>Itens convertidos:</strong> ${result.stats.itemsConverted}</li>
            <li><strong>Resource Pack:</strong> ${result.stats.hasResourcePack ? "Incluído" : "Não encontrado"}</li>
        </ul>
        <p class="hint">O arquivo ZIP está pronto para ser extraído em <code>plugins/ItemsAdder/contents/</code></p>
    `;
    
    converterSummary.innerHTML = "";
    converterSummary.appendChild(summary);
}

function showConverterFeedback(message, variant) {
    converterFeedback.textContent = message;
    converterFeedback.dataset.variant = variant;
}

function setConverterBusyState(isBusy) {
    converterDropZone.classList.toggle("is-busy", isBusy);
    converterDropZone.setAttribute("aria-busy", isBusy ? "true" : "false");
    converterBrowseBtn.disabled = isBusy;
}

