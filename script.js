document.addEventListener('DOMContentLoaded', () => {

    let referenceState = null;
    let currentTotalCost = 0;

    const dom = {
        tempAussen: document.getElementById('tempAussen'), rhAussen: document.getElementById('rhAussen'),
        tempZuluft: document.getElementById('tempZuluft'), rhZuluft: document.getElementById('rhZuluft'),
        xZuluft: document.getElementById('xZuluft'), volumenstrom: document.getElementById('volumenstrom'),
        kuehlerAktiv: document.getElementById('kuehlerAktiv'),
        druck: document.getElementById('druck'), feuchteSollTyp: document.getElementById('feuchteSollTyp'),
        resetBtn: document.getElementById('resetBtn'), preisWaerme: document.getElementById('preisWaerme'),
        preisStrom: document.getElementById('preisStrom'), eer: document.getElementById('eer'),
        volumenstromSlider: document.getElementById('volumenstromSlider'), tempZuluftSlider: document.getElementById('tempZuluftSlider'),
        rhZuluftSlider: document.getElementById('rhZuluftSlider'), volumenstromLabel: document.getElementById('volumenstromLabel'),
        tempZuluftLabel: document.getElementById('tempZuluftLabel'), rhZuluftLabel: document.getElementById('rhZuluftLabel'),
        rhZuluftSliderGroup: document.getElementById('rhZuluftSliderGroup'),
        resetSlidersBtn: document.getElementById('resetSlidersBtn'),
        processOverviewContainer: document.getElementById('process-overview-container'),
        nodes: [document.getElementById('node-0'), document.getElementById('node-1'), document.getElementById('node-2'), document.getElementById('node-3'), document.getElementById('node-final')],
        compVE: { node: document.getElementById('comp-ve'), p: document.getElementById('res-p-ve'), wv: document.getElementById('res-wv-ve') },
        compK: { node: document.getElementById('comp-k'), p: document.getElementById('res-p-k'), kondensat: document.getElementById('res-kondensat'), wv: document.getElementById('res-wv-k') },
        compNE: { node: document.getElementById('comp-ne'), p: document.getElementById('res-p-ne'), wv: document.getElementById('res-wv-ne') },
        summaryContainer: document.getElementById('summary-container'),
        referenceDetails: document.getElementById('reference-details'),
        kostenAenderung: document.getElementById('kostenAenderung'), tempAenderung: document.getElementById('tempAenderung'),
        rhAenderung: document.getElementById('rhAenderung'), volumenAenderung: document.getElementById('volumenAenderung'),
        gesamtleistungWaerme: document.getElementById('gesamtleistungWaerme'), gesamtleistungKaelte: document.getElementById('gesamtleistungKaelte'),
        kostenHeizung: document.getElementById('kostenHeizung'), kostenKuehlung: document.getElementById('kostenKuehlung'),
        kostenGesamt: document.getElementById('kostenGesamt'), setReferenceBtn: document.getElementById('setReferenceBtn'),
        kuehlmodus: document.getElementById('kuehlmodus'), kuehlmodusWrapper: document.getElementById('kuehlmodusWrapper'),
        sollFeuchteWrapper: document.getElementById('sollFeuchteWrapper'),
        tempHeizVorlauf: document.getElementById('tempHeizVorlauf'), tempHeizRuecklauf: document.getElementById('tempHeizRuecklauf'),
        tempKuehlVorlauf: document.getElementById('tempKuehlVorlauf'), tempKuehlRuecklauf: document.getElementById('tempKuehlRuecklauf'),
        preisKaelte: document.getElementById('preisKaelte'),
        kaelteBasisInputs: document.querySelectorAll('input[name="kaeltebasis"]'),
    };

    const TOLERANCE = 0.01; const CP_WASSER = 4.186; const RHO_WASSER = 1000;
    const MIN_DEW_POINT = 2.0; 

    function getPs(T) { if (T >= 0) return 611.2 * Math.exp((17.62 * T) / (243.12 + T)); else return 611.2 * Math.exp((22.46 * T) / (272.62 + T)); }
    function getX(T, rH, p) { if (p <= 0) return Infinity; const p_s = getPs(T); const p_v = (rH / 100) * p_s; if (p_v >= p) return Infinity; return 622 * (p_v / (p - p_v)); }
    function getRh(T, x, p) { if (p <= 0) return 0; const p_s = getPs(T); if (p_s <= 0) return 0; const p_v = (p * x) / (622 + x); return Math.min(100, (p_v / p_s) * 100); }
    function getTd(x, p) { const p_v = (p * x) / (622 + x); if (p_v < 611.2) return -60; const log_pv_ratio = Math.log(p_v / 611.2); return (243.12 * log_pv_ratio) / (17.62 - log_pv_ratio); }
    function getH(T, x_g_kg) { if (!isFinite(x_g_kg)) return Infinity; const x_kg_kg = x_g_kg / 1000.0; return 1.006 * T + x_kg_kg * (2501 + 1.86 * T); }

    function calculateAll() {
        const inputs = {
            tempAussen: parseFloat(dom.tempAussen.value), rhAussen: parseFloat(dom.rhAussen.value),
            tempZuluft: parseFloat(dom.tempZuluft.value), rhZuluft: parseFloat(dom.rhZuluft.value),
            xZuluft: parseFloat(dom.xZuluft.value), volumenstrom: parseFloat(dom.volumenstrom.value),
            kuehlerAktiv: dom.kuehlerAktiv.checked, tempVorerhitzerSoll: 5.0,
            druck: parseFloat(dom.druck.value) * 100, feuchteSollTyp: dom.feuchteSollTyp.value,
            preisWaerme: parseFloat(dom.preisWaerme.value), preisStrom: parseFloat(dom.preisStrom.value),
            eer: parseFloat(dom.eer.value), kuehlmodus: dom.kuehlmodus.value,
            tempHeizVorlauf: parseFloat(dom.tempHeizVorlauf.value), tempHeizRuecklauf: parseFloat(dom.tempHeizRuecklauf.value),
            tempKuehlVorlauf: parseFloat(dom.tempKuehlVorlauf.value), tempKuehlRuecklauf: parseFloat(dom.tempKuehlRuecklauf.value),
            preisKaelte: parseFloat(dom.preisKaelte.value),
        };

        const aussen = { t: inputs.tempAussen, rh: inputs.rhAussen, x: getX(inputs.tempAussen, inputs.rhAussen, inputs.druck) };
        if (!isFinite(aussen.x)) { dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Fehler im Außenluft-Zustand.</div>`; return; }
        aussen.h = getH(aussen.t, aussen.x);

        const massenstrom_kg_s = (inputs.volumenstrom / 3600) * 1.2;
        const zuluftSoll = { t: inputs.tempZuluft };
        if (inputs.kuehlerAktiv && inputs.kuehlmodus === 'dehumidify') {
            if (inputs.feuchteSollTyp === 'rh') { zuluftSoll.rh = inputs.rhZuluft; zuluftSoll.x = getX(zuluftSoll.t, zuluftSoll.rh, inputs.druck); } 
            else { zuluftSoll.x = inputs.xZuluft; zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck); }
            
            const zielTaupunkt = getTd(zuluftSoll.x, inputs.druck);
            if (zielTaupunkt < MIN_DEW_POINT) {
                dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Warnung: Feuchte-Sollwert erfordert Abkühlung unter ${MIN_DEW_POINT}°C. Technisch nicht sinnvoll.</div>`;
                return;
            }
        } else {
            zuluftSoll.x = aussen.x;
            zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck);
        }
        zuluftSoll.h = getH(zuluftSoll.t, zuluftSoll.x);

        let states = [aussen, {...aussen}, {...aussen}, {...aussen}];
        let operations = { ve: {p:0, wv:0}, k: {p:0, kondensat:0, wv:0}, ne: {p:0, wv:0} };
        
        let currentState = states[0];
        if (currentState.t < inputs.tempVorerhitzerSoll) {
            const hNach = getH(inputs.tempVorerhitzerSoll, currentState.x);
            operations.ve.p = massenstrom_kg_s * (hNach - currentState.h);
            currentState = {t: inputs.tempVorerhitzerSoll, h: hNach, x: currentState.x, rh: getRh(inputs.tempVorerhitzerSoll, currentState.x, inputs.druck)};
        }
        states[1] = { ...currentState };
        
        if (inputs.kuehlerAktiv && currentState.t > zuluftSoll.t + TOLERANCE) {
            if (inputs.kuehlmodus === 'dehumidify' && currentState.x > zuluftSoll.x + TOLERANCE) {
                const tempNachKuehler = getTd(zuluftSoll.x, inputs.druck);
                const hNachKuehler = getH(tempNachKuehler, zuluftSoll.x);
                operations.k.p = massenstrom_kg_s * (currentState.h - hNachKuehler);
                operations.k.kondensat = massenstrom_kg_s * (currentState.x - zuluftSoll.x) / 1000 * 3600;
                currentState = { t: tempNachKuehler, h: hNachKuehler, x: zuluftSoll.x, rh: getRh(tempNachKuehler, zuluftSoll.x, inputs.druck) };
            } else if (inputs.kuehlmodus === 'sensible') {
                const startDewPoint = getTd(currentState.x, inputs.druck);
                if (zuluftSoll.t < startDewPoint) {
                    const x_final = getX(zuluftSoll.t, 100, inputs.druck);
                    const h_final = getH(zuluftSoll.t, x_final);
                    operations.k.p = massenstrom_kg_s * (currentState.h - h_final);
                    operations.k.kondensat = massenstrom_kg_s * (currentState.x - x_final) / 1000 * 3600;
                    currentState = { t: zuluftSoll.t, h: h_final, x: x_final, rh: getRh(zuluftSoll.t, x_final, inputs.druck) };
                } else {
                    const h_final = getH(zuluftSoll.t, currentState.x);
                    operations.k.p = massenstrom_kg_s * (currentState.h - h_final);
                    currentState = { t: zuluftSoll.t, h: h_final, x: currentState.x, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck)};
                }
            }
        }
        states[2] = { ...currentState };

        if (currentState.t < zuluftSoll.t - TOLERANCE) {
            const h_final = getH(zuluftSoll.t, currentState.x);
            operations.ne.p = massenstrom_kg_s * (h_final - currentState.h);
            currentState = { t: zuluftSoll.t, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck), x: currentState.x, h: h_final };
        }
        states[3] = { ...currentState };

        const deltaT_heiz = Math.abs(inputs.tempHeizVorlauf - inputs.tempHeizRuecklauf);
        if (deltaT_heiz > 0) {
            operations.ve.wv = (operations.ve.p / (RHO_WASSER * CP_WASSER * deltaT_heiz)) * 3600;
            operations.ne.wv = (operations.ne.p / (RHO_WASSER * CP_WASSER * deltaT_heiz)) * 3600;
        }
        const deltaT_kuehl = Math.abs(inputs.tempKuehlRuecklauf - inputs.tempKuehlVorlauf);
        if (deltaT_kuehl > 0) operations.k.wv = (operations.k.p / (RHO_WASSER * CP_WASSER * deltaT_kuehl)) * 3600;
        
        renderAll(states, operations, inputs);
    }

    function renderAll(states, operations, inputs) {
        const finalState = states[3];
        const startState = states[0];
        let colors = ['color-green', 'color-green', 'color-green', 'color-green'];
        colors[1] = operations.ve.p > 0 ? 'color-red' : colors[0];
        colors[2] = operations.k.p > 0 ? 'color-blue' : colors[1];
        colors[3] = operations.ne.p > 0 ? 'color-red' : colors[2];
        const finalColor = finalState.t < startState.t - TOLERANCE ? 'color-blue' : (finalState.t > startState.t + TOLERANCE ? 'color-red' : 'color-green');

        updateStateNode(dom.nodes[0], states[0], colors[0]);
        updateComponentNode(dom.compVE, operations.ve.p, -1, operations.ve.wv);
        updateStateNode(dom.nodes[1], states[1], colors[1], operations.ve.p <= 0);
        updateComponentNode(dom.compK, operations.k.p, operations.k.kondensat, operations.k.wv);
        updateStateNode(dom.nodes[2], states[2], colors[2], operations.k.p <= 0);
        updateComponentNode(dom.compNE, operations.ne.p, -1, operations.ne.wv);
        updateStateNode(dom.nodes[3], states[3], colors[3], operations.ne.p <= 0);
        updateStateNode(dom.nodes[4], finalState, finalColor);

        const activeSteps = Object.values(operations).filter(op => op.p > 0);
        let overviewClass = 'process-success';
        if (activeSteps.length > 0) {
            overviewClass = operations.k.p > 0 ? 'process-info' : 'process-heating';
            const activeNames = Object.entries(operations).filter(([,op]) => op.p > 0).map(([key]) => key.toUpperCase());
            dom.processOverviewContainer.innerHTML = `<div class="process-overview ${overviewClass}">Prozesskette: ${activeNames.join(' → ')}</div>`;
        } else {
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-success">Idealzustand</div>`;
        }

        let heizleistungGesamt = operations.ve.p + operations.ne.p;
        dom.summaryContainer.innerHTML = (operations.ve.p > 0 && operations.ne.p > 0) ? `<div class="process-step summary"><h4>➕ Gesamt-Heizleistung</h4><div class="result-grid"><div class="result-item"><span class="label">Leistung (VE + NE)</span><span class="value">${heizleistungGesamt.toFixed(2)} kW</span></div></div></div>` : '';
        
        const kaelteLeistung = operations.k.p;
        dom.gesamtleistungWaerme.textContent = `${heizleistungGesamt.toFixed(2)} kW`;
        dom.gesamtleistungKaelte.textContent = `${kaelteLeistung.toFixed(2)} kW`;

        const kostenHeizung = heizleistungGesamt * inputs.preisWaerme;
        const kostenKuehlung = kaelteLeistung * inputs.preisKaelte;
        currentTotalCost = kostenHeizung + kostenKuehlung;
        
        dom.kostenHeizung.textContent = `${kostenHeizung.toFixed(2)} €/h`;
        dom.kostenKuehlung.textContent = `${kostenKuehlung.toFixed(2)} €/h`;
        dom.kostenGesamt.textContent = `${currentTotalCost.toFixed(2)} €/h`;
        
        dom.setReferenceBtn.className = referenceState ? 'activated' : '';
        dom.setReferenceBtn.textContent = referenceState ? 'Referenz gesetzt' : 'Referenz festlegen';

        if (referenceState) {
            dom.referenceDetails.classList.remove('invisible');
            const changeAbs = currentTotalCost - referenceState.cost;
            const changePerc = referenceState.cost > 0 ? (changeAbs / referenceState.cost) * 100 : 0;
            const sign = changeAbs >= 0 ? '+' : '';
            const changeClass = changeAbs < -TOLERANCE ? 'saving' : (changeAbs > TOLERANCE ? 'expense' : '');
            dom.kostenAenderung.textContent = `${sign}${changeAbs.toFixed(2)} €/h (${sign}${changePerc.toFixed(1)} %)`;
            dom.kostenAenderung.className = `cost-value ${changeClass}`;
            const deltaTemp = inputs.tempZuluft - referenceState.temp;
            dom.tempAenderung.textContent = `${deltaTemp >= 0 ? '+' : ''}${deltaTemp.toFixed(1)} °C`;
            const deltaRh = inputs.rhZuluft - referenceState.rh;
            dom.rhAenderung.textContent = `${deltaRh >= 0 ? '+' : ''}${deltaRh.toFixed(1)} %`;
            const deltaVol = inputs.volumenstrom - referenceState.vol;
            dom.volumenAenderung.textContent = `${deltaVol >= 0 ? '+' : ''}${deltaVol.toFixed(0)} m³/h`;
        }
    }
    
    function updateStateNode(node, state, colorClass, isInactive = false) {
        node.className = 'state-node';
        if (colorClass) node.classList.add(colorClass);
        if (isInactive) node.classList.add('inactive');
        if(node.id === 'node-final') node.classList.add('final-state');
        
        const spans = node.querySelectorAll('span');
        spans[1].textContent = state.t.toFixed(1);
        spans[3].textContent = state.rh.toFixed(1);
        spans[5].textContent = state.x.toFixed(2);
    }
    function updateComponentNode(comp, power, kondensat = -1, wasserstrom = 0) {
        comp.p.textContent = power.toFixed(2);
        comp.node.classList.toggle('active', power > 0);
        comp.node.classList.toggle('inactive', power <= 0);
        if (comp.kondensat) comp.kondensat.textContent = (kondensat >= 0) ? kondensat.toFixed(2) : '0.00';
        if (comp.wv) comp.wv.textContent = wasserstrom.toFixed(2);
    }

    function handleSetReference() {
        referenceState = { cost: currentTotalCost, temp: parseFloat(dom.tempZuluft.value), rh: parseFloat(dom.rhZuluft.value), vol: parseFloat(dom.volumenstrom.value) };
        dom.resetSlidersBtn.disabled = false;
        dom.referenceDetails.classList.remove('invisible');
        calculateAll();
    }
    
    function resetToDefaults() {
        referenceState = null; dom.resetSlidersBtn.disabled = true;
        dom.referenceDetails.classList.add('invisible');

        dom.tempAussen.value = 20.0; dom.rhAussen.value = 50.0;
        dom.tempZuluft.value = 20.0; dom.rhZuluft.value = 50.0;
        dom.xZuluft.value = 7.26; dom.volumenstrom.value = 5000;
        dom.kuehlerAktiv.checked = true; dom.kuehlmodus.value = 'dehumidify';
        dom.druck.value = 1013.25; dom.feuchteSollTyp.value = 'rh';
        dom.preisWaerme.value = 0.12; dom.preisStrom.value = 0.30;
        dom.eer.value = 3.5;
        dom.tempHeizVorlauf.value = 70; dom.tempHeizRuecklauf.value = 50;
        dom.tempKuehlVorlauf.value = 8; dom.tempKuehlRuecklauf.value = 13;
        dom.kaelteBasisInputs[0].checked = true;
        
        syncAllSlidersToInputs();
        handleKuehlerToggle();
        updateCostDependencies();
        calculateAll();
    }
    
    function resetSlidersToRef() {
        if (!referenceState) return;
        dom.tempZuluft.value = referenceState.temp.toFixed(1);
        dom.rhZuluft.value = referenceState.rh.toFixed(1);
        dom.volumenstrom.value = referenceState.vol;
        syncAllSlidersToInputs();
        calculateAll();
    }

    function handleKuehlerToggle() {
        const isActive = dom.kuehlerAktiv.checked;
        dom.kuehlmodusWrapper.classList.toggle('hidden', !isActive);
        const isDehumidify = dom.kuehlmodus.value === 'dehumidify';
        dom.sollFeuchteWrapper.style.display = isActive && isDehumidify ? 'block' : 'none';
    }
    
    function syncAllSlidersToInputs(){
        const tempVal = parseFloat(dom.tempZuluft.value);
        if(!isNaN(tempVal)) {
            dom.tempZuluftSlider.min = (tempVal - 6).toFixed(1);
            dom.tempZuluftSlider.max = (tempVal + 6).toFixed(1);
        }
        const volVal = parseFloat(dom.volumenstrom.value);
        if(!isNaN(volVal)) {
            dom.volumenstromSlider.min = Math.round(volVal * 0.5 / 100) * 100;
            dom.volumenstromSlider.max = Math.round(volVal * 1.5 / 100) * 100;
        }
        syncSliderToInput(dom.volumenstrom, dom.volumenstromSlider, dom.volumenstromLabel);
        syncSliderToInput(dom.tempZuluft, dom.tempZuluftSlider, dom.tempZuluftLabel, true);
        syncSliderToInput(dom.rhZuluft, dom.rhZuluftSlider, dom.rhZuluftLabel, true);
    }
    function syncSliderToInput(input, slider, label, isFloat = false) {
        const newValue = parseFloat(input.value);
        if(isNaN(newValue)) return;
        slider.value = newValue;
        label.textContent = isFloat ? newValue.toFixed(1) : newValue;
    }

    function updateCostDependencies() {
        const basis = document.querySelector('input[name="kaeltebasis"]:checked').value;
        const strom = parseFloat(dom.preisStrom.value);
        const eer = parseFloat(dom.eer.value);
        const kaelte = parseFloat(dom.preisKaelte.value);

        dom.preisStrom.readOnly = (basis === 'kaelte_eer');
        dom.preisKaelte.readOnly = (basis === 'strom_eer');

        if (basis === 'strom_eer') {
            if(!isNaN(strom) && !isNaN(eer) && eer > 0) dom.preisKaelte.value = (strom / eer).toFixed(3);
        } else if (basis === 'kaelte_eer') {
            if(!isNaN(kaelte) && !isNaN(eer) && eer > 0) dom.preisStrom.value = (kaelte * eer).toFixed(2);
        }
    }
    
    // --- INITIALIZATION: A simple, explicit, and non-conflicting setup ---
    function addEventListeners() {
        // Simple inputs trigger calculation
        const simpleInputs = [
            dom.tempAussen, dom.rhAussen, dom.druck, dom.preisWaerme, dom.xZuluft, 
            dom.tempHeizVorlauf, dom.tempHeizRuecklauf, dom.tempKuehlVorlauf, dom.tempKuehlRuecklauf
        ];
        simpleInputs.forEach(input => input.addEventListener('input', calculateAll));

        // Cost dependency inputs have their own logic
        const costDepInputs = [dom.preisStrom, dom.eer, dom.preisKaelte];
        costDepInputs.forEach(input => input.addEventListener('input', () => { updateCostDependencies(); calculateAll(); }));
        dom.kaelteBasisInputs.forEach(radio => radio.addEventListener('change', () => { updateCostDependencies(); calculateAll(); }));
        
        // Synced inputs (sliders and number boxes)
        dom.volumenstrom.addEventListener('input', () => { syncAllSlidersToInputs(); calculateAll(); });
        dom.tempZuluft.addEventListener('input', () => { syncAllSlidersToInputs(); calculateAll(); });
        dom.rhZuluft.addEventListener('input', () => { syncAllSlidersToInputs(); calculateAll(); });
        
        const sliders = [dom.volumenstromSlider, dom.tempZuluftSlider, dom.rhZuluftSlider];
        sliders.forEach(slider => {
            slider.addEventListener('input', () => {
                const inputId = slider.id.replace('Slider', '');
                const isFloat = inputId !== 'volumenstrom';
                const value = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
                dom[inputId].value = value;
                dom[inputId+'Label'].textContent = value;
                calculateAll();
            });
        });

        // Toggles and Selects
        dom.kuehlerAktiv.addEventListener('change', () => { handleKuehlerToggle(); calculateAll(); });
        dom.feuchteSollTyp.addEventListener('change', () => { handleKuehlerToggle(); calculateAll(); });
        dom.kuehlmodus.addEventListener('change', () => { handleKuehlerToggle(); calculateAll(); });
        
        // Buttons
        dom.resetBtn.addEventListener('click', resetToDefaults);
        dom.resetSlidersBtn.addEventListener('click', resetSlidersToRef);
        dom.setReferenceBtn.addEventListener('click', handleSetReference);
    }

    addEventListeners();
    handleKuehlerToggle();
    updateCostDependencies();
    syncAllSlidersToInputs();
    calculateAll();
});
