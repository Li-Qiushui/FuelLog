const STORAGE_KEY = "fuel_records_v1";
const CONFIG_KEY = "fuel_config_v1";

function getRecords() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) {
            return { startOdometer: null };
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return { startOdometer: null };
        }
        return {
            startOdometer: Number(parsed.startOdometer) > 0 ? Number(parsed.startOdometer) : null
        };
    } catch (error) {
        return { startOdometer: null };
    }
}

function saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

new Vue({
    el: "#app",
    data: function () {
        const initialConfig = getConfig();
        return {
            config: initialConfig,
            isEditingStartOdometer: !initialConfig.startOdometer,
            form: {
                currentOdometer: null,
                fuel: null,
                cost: null,
                date: ""
            },
            message: "",
            messageType: "success",
            result: null,
            records: getRecords(),
            formDialogVisible: false,
            detailDialogVisible: false,
            detailRecord: null
        };
    },
    computed: {
        latestRecord: function () {
            if (!this.records.length) {
                return null;
            }
            const summary = this.records.reduce(function (acc, item) {
                acc.totalDistance += Number(item.distance) || 0;
                acc.totalCost += Number(item.cost) || 0;
                acc.totalFuel += Number(item.fuel) || 0;
                return acc;
            }, {
                totalDistance: 0,
                totalCost: 0,
                totalFuel: 0
            });

            const totalConsumption = summary.totalDistance > 0
                ? (summary.totalFuel / summary.totalDistance) * 100
                : 0;
            const totalCostPerKm = summary.totalDistance > 0
                ? summary.totalCost / summary.totalDistance
                : 0;

            return {
                distanceText: summary.totalDistance.toFixed(1),
                costText: summary.totalCost.toFixed(2),
                consumptionText: totalConsumption.toFixed(2) + " L/100km",
                costPerKmText: totalCostPerKm.toFixed(2) + " 元/km"
            };
        },
        displayRecords: function () {
            return this.records.slice().reverse().map(function (record, reverseIndex, reversed) {
                const originIndex = reversed.length - 1 - reverseIndex;
                return {
                    date: record.date || "未填写",
                    startOdometerText: Number(record.startOdometer).toFixed(1),
                    currentOdometerText: Number(record.currentOdometer).toFixed(1),
                    distanceText: Number(record.distance).toFixed(1),
                    fuelText: Number(record.fuel).toFixed(2),
                    costText: Number(record.cost).toFixed(2),
                    consumptionText: Number(record.consumption).toFixed(2) + " L/100km",
                    costPerKmText: Number(record.costPerKm).toFixed(2) + " 元/km",
                    pricePerLiterText: Number(record.pricePerLiter).toFixed(2) + " 元/L",
                    originIndex: originIndex
                };
            });
        }
    },
    methods: {
        normalizeRecord: function (record) {
            return {
                startOdometer: Number(record.startOdometer),
                currentOdometer: Number(record.currentOdometer),
                distance: Number(record.distance),
                fuel: Number(record.fuel),
                cost: Number(record.cost),
                date: String(record.date || ""),
                consumption: Number(record.consumption),
                costPerKm: Number(record.costPerKm),
                pricePerLiter: Number(record.pricePerLiter),
                createdAt: Number(record.createdAt) || Date.now()
            };
        },
        isValidRecord: function (record) {
            const requiredNumberFields = [
                "startOdometer",
                "currentOdometer",
                "distance",
                "fuel",
                "cost",
                "consumption",
                "costPerKm",
                "pricePerLiter"
            ];
            if (!record || typeof record !== "object") {
                return false;
            }
            if (!record.date) {
                return false;
            }
            return requiredNumberFields.every(function (field) {
                return Number.isFinite(Number(record[field])) && Number(record[field]) > 0;
            });
        },
        exportData: function () {
            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                config: {
                    startOdometer: this.config.startOdometer
                },
                records: this.records
            };
            const content = JSON.stringify(payload, null, 2);
            const blob = new Blob([content], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const datePart = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = "fuel-records-" + datePart + ".json";
            a.click();
            URL.revokeObjectURL(url);
            this.message = "导出成功。";
            this.messageType = "success";
        },
        triggerImport: function () {
            if (this.$refs.importInput) {
                this.$refs.importInput.value = "";
                this.$refs.importInput.click();
            }
        },
        importData: function (event) {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            const vm = this;
            reader.onload = function (loadEvent) {
                try {
                    const text = String(loadEvent.target.result || "");
                    const parsed = JSON.parse(text);
                    if (!parsed || typeof parsed !== "object") {
                        throw new Error("invalid payload");
                    }
                    const importedRecords = Array.isArray(parsed.records) ? parsed.records : [];
                    const normalizedRecords = importedRecords.map(vm.normalizeRecord);
                    const allValid = normalizedRecords.every(vm.isValidRecord);
                    if (!allValid) {
                        throw new Error("invalid records");
                    }

                    const nextStartOdometer = Number(parsed.config && parsed.config.startOdometer);
                    vm.records = normalizedRecords;
                    vm.config.startOdometer = Number.isFinite(nextStartOdometer) && nextStartOdometer > 0
                        ? nextStartOdometer
                        : null;
                    vm.isEditingStartOdometer = !vm.config.startOdometer;
                    vm.persistRecords();
                    saveConfig(vm.config);
                    vm.result = null;
                    vm.message = "导入成功。";
                    vm.messageType = "success";
                } catch (error) {
                    vm.message = "导入失败：文件格式不正确。";
                    vm.messageType = "error";
                }
            };
            reader.onerror = function () {
                vm.message = "导入失败：文件读取异常。";
                vm.messageType = "error";
            };
            reader.readAsText(file, "utf-8");
        },
        persistRecords: function () {
            saveRecords(this.records);
        },
        saveConfig: function () {
            const startOdometer = Number(this.config.startOdometer);
            if (!this.config.startOdometer || startOdometer <= 0) {
                this.message = "起始满油表显里程必须大于 0。";
                this.messageType = "error";
                return;
            }
            this.config.startOdometer = startOdometer;
            saveConfig(this.config);
            this.isEditingStartOdometer = false;
            this.message = "基础配置已保存。";
            this.messageType = "success";
        },
        editStartOdometer: function () {
            this.isEditingStartOdometer = true;
            this.message = "";
        },
        openRecordDetail: function (item) {
            this.detailRecord = item;
            this.detailDialogVisible = true;
        },
        submitRecord: function () {
            this.message = "";
            this.result = null;

            const startOdometer = Number(this.config.startOdometer);
            const currentOdometer = Number(this.form.currentOdometer);
            const fuel = Number(this.form.fuel);
            const cost = Number(this.form.cost);
            const date = this.form.date;

            if (!this.config.startOdometer) {
                this.message = "请先配置起始满油表显里程。";
                this.messageType = "error";
                return;
            }

            if (!this.form.currentOdometer || !this.form.fuel || !this.form.cost || !this.form.date) {
                this.message = "请填写完整信息。";
                this.messageType = "error";
                return;
            }

            if (currentOdometer <= 0 || fuel <= 0 || cost <= 0) {
                this.message = "请输入大于 0 的数字。";
                this.messageType = "error";
                return;
            }

            if (currentOdometer <= startOdometer) {
                this.message = "当前表显里程必须大于起始满油表显里程。";
                this.messageType = "error";
                return;
            }

            const distance = currentOdometer - startOdometer;
            const consumption = (fuel / distance) * 100;
            const costPerKm = cost / distance;
            const pricePerLiter = cost / fuel;

            this.result = {
                consumption: consumption.toFixed(2),
                costPerKm: costPerKm.toFixed(2),
                pricePerLiter: pricePerLiter.toFixed(2)
            };

            this.records.push({
                startOdometer: startOdometer,
                currentOdometer: currentOdometer,
                distance: distance,
                fuel: fuel,
                cost: cost,
                date: date,
                consumption: consumption,
                costPerKm: costPerKm,
                pricePerLiter: pricePerLiter,
                createdAt: Date.now()
            });
            this.persistRecords();

            this.config.startOdometer = currentOdometer;
            saveConfig(this.config);
            this.formDialogVisible = false;

            this.message = "记录已保存到本地。";
            this.messageType = "success";
        },
        resetForm: function () {
            this.form = {
                currentOdometer: null,
                fuel: null,
                cost: null,
                date: ""
            };
            this.message = "";
            this.result = null;
        },
        removeRecord: function (index) {
            this.records.splice(index, 1);
            this.persistRecords();
            this.message = "记录已删除。";
            this.messageType = "success";
        },
        clearHistory: function () {
            this.records = [];
            this.detailDialogVisible = false;
            this.detailRecord = null;
            localStorage.removeItem(STORAGE_KEY);
            this.message = "历史记录已清空。";
            this.messageType = "success";
            this.result = null;
        }
    }
});
