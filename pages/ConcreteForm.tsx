
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { ConcreteRecord } from '../types';
import { getConcreteRecordById, saveConcreteRecord, getProjectById } from '../services/storageService';
import { transcribeAudio } from '../services/geminiService';
import { fetchRealWeather } from '../services/weatherService';
import { WavRecorder, blobToBase64 } from '../services/audioRecorder';

// --- Constants ---
const STRENGTH_OPTIONS = ['C15', 'C20', 'C25', 'C30', 'C35', 'C40', 'C45', 'C50', 'C55', 'C60', 'C65', 'C70', 'C75', 'C80'];
const IMPERMEABILITY_OPTIONS = ['无', 'P4', 'P6', 'P8', 'P10', 'P12', '>P12'];

// Simulation Options
const UNIT_OPTIONS = ['A单元', 'B单元', 'C单元'];
const CONSTRUCTOR_OPTIONS = ['A单位', 'B单位', 'C单位'];

// --- Components ---

const SectionTitle = ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-bold text-base text-gray-900 mt-6 mb-3 border-l-4 border-blue-600 pl-3">
        {children}
    </h3>
);

const QuestionLabel = ({ index, children }: { index: number, children?: React.ReactNode }) => (
    <div className="text-sm font-medium text-gray-800 mb-2">
        <span className="mr-1">{index}.</span> {children}
    </div>
);

const RadioGroup = ({ name, options, value, onChange }: { name: string, options: string[], value: string, onChange: (val: string) => void }) => (
    <div className="space-y-3">
        {options.map((opt, index) => {
            const isSelected = value === opt;
            // Assume index 0 is the "Correct" (Positive) option, and others are "Incorrect" (Negative)
            const isCorrect = index === 0;

            let containerStyle = "bg-gray-50 border-transparent hover:border-gray-200";
            let dotStyle = "border-gray-300 bg-white";
            let textStyle = "text-gray-700";
            let subTextStyle = "text-gray-400";

            if (isSelected) {
                if (isCorrect) {
                    // Green Theme for Correct Option
                    containerStyle = "bg-green-50 border-green-300 shadow-sm";
                    dotStyle = "border-green-600 bg-green-600";
                    textStyle = "text-green-800 font-bold";
                } else {
                    // Red Theme for Incorrect Option
                    containerStyle = "bg-red-50 border-red-300 shadow-sm";
                    dotStyle = "border-red-600 bg-red-600";
                    textStyle = "text-red-800 font-bold";
                    subTextStyle = "text-red-600/80 font-medium";
                }
            }

            return (
                <label key={opt} className={`flex items-start gap-3 p-3.5 rounded-lg cursor-pointer border transition-all duration-200 ${containerStyle}`}>
                    <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${dotStyle}`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
                    </div>
                    <input 
                        type="radio" 
                        name={name} 
                        value={opt} 
                        checked={isSelected} 
                        onChange={() => onChange(opt)} 
                        className="hidden" 
                    />
                    <div className="flex-1">
                        <span className={`text-sm ${textStyle} block leading-snug`}>{opt}</span>
                        {/* Show hint for incorrect options */}
                        {!isCorrect && (
                            <div className={`text-xs mt-1.5 flex items-center gap-1 ${subTextStyle}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1 1.06-1.06 1.134 1.134 0 0 1 1.06 1.06v.296c0 .878-.293 1.636-.75 2.226a4.293 4.293 0 0 1-.95 1.026.75.75 0 1 1-.9-1.2 2.793 2.793 0 0 0 .633-.684c.305-.393.5-.9.5-1.488v-.18H8.94Zm.81 5.81a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" clipRule="evenodd" />
                                </svg>
                                可在13题中详细说明
                            </div>
                        )}
                    </div>
                </label>
            );
        })}
    </div>
);

const NumberInput = ({ label, value, onChange, suffix, placeholder = "0" }: { label?: string, value: string, onChange: (val: string) => void, suffix?: string, placeholder?: string }) => (
    <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-1 pr-3 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 shadow-sm transition-all">
        {label && <span className="text-gray-500 text-sm ml-3 shrink-0 whitespace-nowrap">{label}</span>}
        <div className="flex items-center flex-1 justify-end">
            <input 
                type="number" 
                inputMode="numeric" 
                pattern="[0-9]*"
                value={value || ''} 
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full text-right p-2 outline-none text-gray-900 font-mono font-medium bg-transparent text-lg"
            />
            {suffix && <span className="text-gray-500 text-sm ml-1 shrink-0 font-medium bg-gray-50 px-1.5 py-0.5 rounded">{suffix}</span>}
        </div>
    </div>
);

// New Component: Dynamic Number Input List
const DynamicNumberInputList = ({ 
    values = [''], 
    onChange, 
    suffix, 
    placeholder = "0" 
}: { 
    values: string[], 
    onChange: (vals: string[]) => void, 
    suffix?: string, 
    placeholder?: string 
}) => {
    const handleValueChange = (index: number, val: string) => {
        const newValues = [...values];
        newValues[index] = val;
        onChange(newValues);
    };

    const handleAdd = () => {
        onChange([...values, '']);
    };

    const handleRemove = (index: number) => {
        if (values.length <= 1) {
            handleValueChange(0, ''); // If only one, just clear it
            return;
        }
        const newValues = values.filter((_, i) => i !== index);
        onChange(newValues);
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                {values.map((val, index) => (
                    <div key={index} className="relative group">
                        <NumberInput 
                            label={`第${index + 1}次`} 
                            value={val} 
                            onChange={(v) => handleValueChange(index, v)} 
                            suffix={suffix} 
                            placeholder={placeholder} 
                        />
                        {/* Remove button (only show if multiple or value exists) */}
                        {values.length > 1 && (
                            <button 
                                onClick={() => handleRemove(index)}
                                className="absolute -top-2 -right-2 bg-red-100 text-red-500 rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <button 
                onClick={handleAdd}
                className="w-full py-2 flex items-center justify-center gap-1 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg border-dashed transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                新增实测数据
            </button>
        </div>
    );
};

const SelectInput = ({ value, onChange, options, suffix, placeholder = "请选择" }: { value: string, onChange: (val: string) => void, options: string[], suffix?: string, placeholder?: string }) => (
    <div className="relative">
        <select 
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-200 text-gray-900 text-base p-3 pr-8 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-medium"
        >
            <option value="" disabled>{placeholder}</option>
            {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
        </div>
        {suffix && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{suffix}</span>}
    </div>
);

// Consistent styling for basic info header inputs
const BasicInfoInput = ({ label, value, onChange, type = "text", placeholder, readOnly = false }: { label: string, value: string, onChange: (val: string) => void, type?: string, placeholder?: string, readOnly?: boolean }) => (
    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
        <span className="font-bold text-gray-700 shrink-0 mr-2 text-sm whitespace-nowrap">{label}</span>
        <input 
            type={type} 
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder={placeholder}
            readOnly={readOnly}
            className={`flex-1 bg-transparent text-gray-600 outline-none text-right font-medium placeholder-gray-400 min-w-0 text-sm ${readOnly ? 'opacity-80' : ''}`}
        />
    </div>
);

// New Component: Select for Basic Info styled like BasicInfoInput
const BasicInfoSelect = ({ label, value, onChange, options, placeholder = "请选择" }: { label: string, value: string, onChange: (val: string) => void, options: string[], placeholder?: string }) => (
    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 relative">
        <span className="font-bold text-gray-700 shrink-0 mr-2 text-sm whitespace-nowrap">{label}</span>
        <select 
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-transparent text-gray-600 outline-none text-right font-medium text-sm appearance-none pr-4 relative z-10 dir-rtl"
            style={{ direction: 'rtl' }}
        >
            <option value="" disabled className="text-gray-400">{placeholder}</option>
            {options.map(opt => (
                <option key={opt} value={opt} className="text-left">{opt}</option>
            ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
        </div>
    </div>
);

// --- Main Form Page ---

const ConcreteForm: React.FC = () => {
    const navigate = useNavigate();
    const { projectId, recordId } = useParams<{ projectId: string, recordId: string }>();
    const [searchParams] = useSearchParams();
    const returnToLogId = searchParams.get('returnToLog');
    
    // Answers State
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [record, setRecord] = useState<ConcreteRecord | null>(null);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSaving, setIsSaving] = useState(false);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);

    // Recording State for Q13
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    
    // Replace MediaRecorder Ref with WavRecorder Ref
    const wavRecorderRef = useRef<WavRecorder | null>(null);

    useEffect(() => {
        const init = async () => {
            if (projectId) {
                // Auto-fill Project Name & Number
                if (!answers['info_project_name'] || !answers['info_project_number']) {
                    const proj = await getProjectById(projectId);
                    if (proj) {
                        setAnswers(prev => ({ 
                            ...prev, 
                            info_project_name: prev['info_project_name'] || proj.name,
                            info_project_number: prev['info_project_number'] || proj.projectNumber || '' 
                        }));
                    }
                }
            }

            // Auto-fetch Weather for new records
            if ((!recordId || recordId === 'new') && !answers['info_weather']) {
                handleRefreshWeather();
            }

            if (recordId && recordId !== 'new') {
                loadRecord();
            } else {
                // For new records, initialize the dynamic arrays
                setAnswers(prev => ({
                    ...prev,
                    q9_list: [''],
                    q10_list: ['']
                }));
            }
        };
        init();
    }, [recordId, projectId]);

    const loadRecord = async () => {
        if (!recordId) return;
        const data = await getConcreteRecordById(recordId);
        if (data) {
            setRecord(data);
            
            // Legacy Data Migration: If list doesn't exist but individual values do
            const initialData = data.data || {};
            
            // Q9 Migration
            if (!initialData['q9_list']) {
                const legacyQ9 = [];
                if (initialData['q9_val1']) legacyQ9.push(initialData['q9_val1']);
                if (initialData['q9_val2']) legacyQ9.push(initialData['q9_val2']);
                if (legacyQ9.length === 0) legacyQ9.push('');
                initialData['q9_list'] = legacyQ9;
            }

            // Q10 Migration
            if (!initialData['q10_list']) {
                const legacyQ10 = [];
                if (initialData['q10_val1']) legacyQ10.push(initialData['q10_val1']);
                if (initialData['q10_val2']) legacyQ10.push(initialData['q10_val2']);
                if (legacyQ10.length === 0) legacyQ10.push('');
                initialData['q10_list'] = legacyQ10;
            }

            setAnswers(initialData);
            setDate(data.date);
        }
    };

    const handleAnswerChange = (key: string, value: any) => {
        setAnswers(prev => ({ ...prev, [key]: value }));
    };

    const handleRefreshWeather = async () => {
        setIsWeatherLoading(true);
        handleAnswerChange('info_weather', '正在获取...');
        try {
            const result = await fetchRealWeather();
            if (result.success) {
                handleAnswerChange('info_weather', result.weather);
            } else {
                handleAnswerChange('info_weather', '获取失败，请手动输入');
            }
        } catch (e) {
            handleAnswerChange('info_weather', '');
        } finally {
            setIsWeatherLoading(false);
        }
    };

    // --- Validation Logic ---
    const validateForm = (): string[] => {
        const missing: string[] = [];
        const isEmpty = (val: any) => val === undefined || val === null || val === '';

        // Basic Info - STRICT CHECK
        if (isEmpty(answers['info_unit_name'])) missing.push('基本信息：单位工程名称');
        if (isEmpty(answers['info_part'])) missing.push('基本信息：旁站部位');
        if (isEmpty(answers['info_constructor'])) missing.push('基本信息：施工单位');
        if (isEmpty(answers['info_start_time'])) missing.push('基本信息：开始时间');
        if (isEmpty(answers['info_end_time'])) missing.push('基本信息：结束时间');
        if (isEmpty(answers['info_weather'])) missing.push('基本信息：天气情况');
        
        // Part 1
        if (isEmpty(answers['q1_workers']) || isEmpty(answers['q1_tech']) || isEmpty(answers['q1_safety'])) missing.push('1. 现场人员');
        if (isEmpty(answers['q2_pumps']) || isEmpty(answers['q2_vibrators'])) missing.push('2. 施工机具');
        if (isEmpty(answers['q3_strength']) || isEmpty(answers['q3_slump']) || isEmpty(answers['q3_volume'])) missing.push('3. 混凝土设计需求');

        // Part 2
        if (isEmpty(answers['q4'])) missing.push('4. 准备工作核查');
        if (isEmpty(answers['q5'])) missing.push('5. 施工用电检查');
        if (isEmpty(answers['q6'])) missing.push('6. 现场管理状态');
        if (isEmpty(answers['q7'])) missing.push('7. 强度等级核查');
        if (isEmpty(answers['q8'])) missing.push('8. 抗渗等级核查');
        
        // Dynamic List Validation: Check if at least one value is filled
        const hasSlump = answers['q9_list']?.some((v: string) => v && v.trim() !== '');
        if (!hasSlump) missing.push('9. 坍落度实测');
        
        // Q11 - ALL FIELDS
        if (isEmpty(answers['q11_total'])) missing.push('11. 试块总组数');
        if (isEmpty(answers['q11_standard'])) missing.push('11. 标准养护组数');
        if (isEmpty(answers['q11_same'])) missing.push('11. 同条件养护组数');
        if (isEmpty(answers['q11_impermeability'])) missing.push('11. 抗渗试块组数');
        if (isEmpty(answers['q11_flexural'])) missing.push('11. 抗折试块组数');

        // Part 3
        if (isEmpty(answers['q12'])) missing.push('12. 异常情况描述');

        return missing;
    };

    // --- Voice Recording Logic for Q13 ---
    const startRecording = async () => {
        if (!window.isSecureContext) {
            alert("无法访问麦克风(需要HTTPS)");
            return;
        }

        try {
            const recorder = new WavRecorder();
            await recorder.start();
            wavRecorderRef.current = recorder;
            setIsRecording(true);
        } catch (err) {
            console.error(err);
            alert("麦克风启动失败，请检查权限");
        }
    };

    const stopRecording = async () => {
        if (!wavRecorderRef.current || !isRecording) return;
        setIsRecording(false);
        
        try {
            const wavBlob = await wavRecorderRef.current.stop();
            if (wavBlob.size < 100) return;
            
            const base64Audio = await blobToBase64(wavBlob);
            
            setIsTranscribing(true);
            try {
                const text = await transcribeAudio(base64Audio);
                if (text && !text.startsWith('（')) {
                    const current = answers['q13'] || '';
                    handleAnswerChange('q13', current + (current ? '\n' : '') + text);
                } else {
                    alert("未能识别有效语音，请重试");
                }
            } catch (e) {
                console.error(e);
                alert("转写失败");
            } finally {
                setIsTranscribing(false);
            }

        } catch (e) {
            console.error(e);
        }
        wavRecorderRef.current = null;
    };

    // --- Save Logic ---
    const handleSave = async (targetStatus: 'draft' | 'completed') => {
        if (!projectId) return;
        let finalStatus = targetStatus;

        if (targetStatus === 'completed') {
            const missingQuestions = validateForm();
            if (missingQuestions.length > 0) {
                const confirmMsg = `还有 ${missingQuestions.length} 项内容未填：\n${missingQuestions.slice(0, 5).join('\n')}${missingQuestions.length > 5 ? '\n...' : ''}\n\n所有信息必须填写完整才能完成。\n是否保存为【草稿】？`;
                if (window.confirm(confirmMsg)) {
                    finalStatus = 'draft';
                } else {
                    return;
                }
            }
        }

        setIsSaving(true);
        const idToUse = record?.id || (recordId === 'new' ? Date.now().toString() : recordId!);
        const newRecord: ConcreteRecord = {
            id: idToUse,
            projectId,
            date,
            createdAt: record?.createdAt || Date.now(),
            status: finalStatus,
            data: answers
        };

        try {
            const savedId = await saveConcreteRecord(newRecord);
            
            if (finalStatus === 'completed') {
                // Redirect to Report Preview if completed
                navigate(`/project/${projectId}/side/concrete/report/${savedId}`);
            } else {
                // Return logic if draft
                if (returnToLogId) {
                    navigate(`/project/${projectId}/record/${returnToLogId}`);
                } else {
                    navigate(`/project/${projectId}/side/concrete`);
                }
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = async () => {
        // Auto-save draft on back
        if (projectId) {
            setIsSaving(true);
            try {
                const idToUse = record?.id || (recordId === 'new' ? Date.now().toString() : recordId!);
                const statusToSave = record?.status === 'completed' ? 'completed' : 'draft';
                await saveConcreteRecord({
                    id: idToUse,
                    projectId,
                    date,
                    createdAt: record?.createdAt || Date.now(),
                    status: statusToSave,
                    data: answers
                });
            } catch (e) { console.error(e); } finally { setIsSaving(false); }
        }
        if (returnToLogId) navigate(`/project/${projectId}/record/${returnToLogId}`);
        else navigate(`/project/${projectId}/side/concrete`);
    };

    return (
        <Layout 
            title={recordId === 'new' ? '新建旁站记录' : '编辑旁站记录'}
            showBack
            onBack={handleBack}
            headerRight={
                <div className="flex items-center">
                    <button onClick={() => handleSave('draft')} disabled={isSaving} className="text-sm font-medium text-gray-500 px-3 py-1.5 active:bg-gray-100 rounded mr-1">存草稿</button>
                    <button onClick={() => handleSave('completed')} disabled={isSaving} className="text-sm font-bold text-blue-600 px-3 py-1.5 active:bg-blue-50 rounded">{isSaving ? '保存中' : '完成'}</button>
                </div>
            }
        >
            <div className="flex-1 overflow-y-auto bg-white p-5 pb-24">
                
                {/* --- Basic Information Section --- */}
                <div className="space-y-3 mb-8">
                    {/* Removed Date Input Display as requested */}
                    
                    <BasicInfoInput 
                        label="单项工程名称" 
                        value={answers['info_project_name']} 
                        onChange={(v: string) => handleAnswerChange('info_project_name', v)}
                        placeholder="自动获取项目名称..."
                        // User can still edit if needed, but mostly auto-filled
                    />

                    <BasicInfoInput 
                        label="项目编号" 
                        value={answers['info_project_number']} 
                        onChange={(v: string) => handleAnswerChange('info_project_number', v)}
                        placeholder="自动获取项目编号..."
                        readOnly={true}
                    />

                    <BasicInfoSelect 
                        label="单位工程名称" 
                        value={answers['info_unit_name']} 
                        onChange={(v: string) => handleAnswerChange('info_unit_name', v)}
                        options={UNIT_OPTIONS}
                        placeholder="请选择单元"
                    />

                    <BasicInfoInput 
                        label="旁站部位" 
                        value={answers['info_part']} 
                        onChange={(v: string) => handleAnswerChange('info_part', v)}
                        placeholder="例如：二层梁板"
                    />

                     <BasicInfoSelect 
                        label="施工单位" 
                        value={answers['info_constructor']} 
                        onChange={(v: string) => handleAnswerChange('info_constructor', v)}
                        options={CONSTRUCTOR_OPTIONS}
                        placeholder="请选择施工单位"
                    />

                     <BasicInfoInput 
                        label="旁站开始时间" 
                        value={answers['info_start_time']} 
                        onChange={(v: string) => handleAnswerChange('info_start_time', v)}
                        type="datetime-local"
                    />
                     <BasicInfoInput 
                        label="旁站结束时间" 
                        value={answers['info_end_time']} 
                        onChange={(v: string) => handleAnswerChange('info_end_time', v)}
                        type="datetime-local"
                    />
                     
                     {/* Auto-Weather Input with Refresh */}
                     <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="font-bold text-gray-700 shrink-0 mr-2 text-sm whitespace-nowrap">天气情况</span>
                        <div className="flex-1 flex items-center gap-2">
                            <input 
                                type="text" 
                                value={answers['info_weather'] || ''} 
                                onChange={(e) => handleAnswerChange('info_weather', e.target.value)} 
                                placeholder="自动获取或手动输入"
                                className="flex-1 bg-transparent text-gray-600 outline-none text-right font-medium placeholder-gray-400 min-w-0 text-sm"
                            />
                            <button 
                                onClick={handleRefreshWeather}
                                disabled={isWeatherLoading}
                                className="p-1 bg-white border border-gray-200 rounded-md text-blue-600 active:bg-blue-50 shadow-sm shrink-0"
                                title="刷新天气"
                            >
                                {isWeatherLoading ? (
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* --- Part 1 --- */}
                <SectionTitle>第一部分：关键部位（工序）施工情况</SectionTitle>
                
                <div className="space-y-6">
                    <div>
                        <QuestionLabel index={1}>现场人员投入统计：</QuestionLabel>
                        <div className="grid grid-cols-1 gap-2.5">
                            <NumberInput label="施工人员" value={answers['q1_workers']} onChange={v => handleAnswerChange('q1_workers', v)} suffix="人" />
                            <NumberInput label="技术员" value={answers['q1_tech']} onChange={v => handleAnswerChange('q1_tech', v)} suffix="人" />
                            <NumberInput label="安全员" value={answers['q1_safety']} onChange={v => handleAnswerChange('q1_safety', v)} suffix="人" />
                        </div>
                    </div>

                    <div>
                        <QuestionLabel index={2}>施工机具投入统计：</QuestionLabel>
                        <div className="grid grid-cols-1 gap-2.5">
                            <NumberInput label="泵车" value={answers['q2_pumps']} onChange={v => handleAnswerChange('q2_pumps', v)} suffix="辆" />
                            <NumberInput label="振捣棒" value={answers['q2_vibrators']} onChange={v => handleAnswerChange('q2_vibrators', v)} suffix="根" />
                        </div>
                    </div>

                    <div>
                        <QuestionLabel index={3}>混凝土设计需求：</QuestionLabel>
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-sm w-20 shrink-0">强度型号</span>
                                <div className="flex-1">
                                    <SelectInput 
                                        value={answers['q3_strength']} 
                                        onChange={v => handleAnswerChange('q3_strength', v)} 
                                        options={STRENGTH_OPTIONS}
                                        placeholder="请选择"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-sm w-20 shrink-0">坍落度</span>
                                <div className="flex-1">
                                    <NumberInput value={answers['q3_slump']} onChange={v => handleAnswerChange('q3_slump', v)} suffix="mm" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-sm w-20 shrink-0">混凝土量</span>
                                <div className="flex-1">
                                    <NumberInput value={answers['q3_volume']} onChange={v => handleAnswerChange('q3_volume', v)} suffix="m³" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- Part 2 --- */}
                <SectionTitle>第二部分：监理旁站情况</SectionTitle>
                
                <div className="space-y-6">
                    <div>
                        <QuestionLabel index={4}>施工前准备工作核查：</QuestionLabel>
                        <RadioGroup 
                            name="q4" 
                            value={answers['q4']} 
                            onChange={(v) => handleAnswerChange('q4', v)} 
                            options={[
                                'A. 安全技术交底和施工方案交底已落实，施工人员已签字确认，符合要求。',
                                'B. 安全技术交底或施工方案未完全交底，已整改并重新交底签字。'
                            ]} 
                        />
                    </div>
                    <div>
                        <QuestionLabel index={5}>施工用电安全检查：</QuestionLabel>
                        <RadioGroup 
                            name="q5" 
                            value={answers['q5']} 
                            onChange={(v) => handleAnswerChange('q5', v)} 
                            options={[
                                'A. 现场施工临时用电符合规范要求。',
                                'B. 现场施工临时用电存在隐患（请在第三部分记录详情）。'
                            ]} 
                        />
                    </div>
                    <div>
                        <QuestionLabel index={6}>现场管理与机具状态：</QuestionLabel>
                        <RadioGroup 
                            name="q6" 
                            value={answers['q6']} 
                            onChange={(v) => handleAnswerChange('q6', v)} 
                            options={[
                                'A. 管理人员在岗，施工机具运转正常，满足要求。',
                                'B. 管理人员不足或机具存在故障，已要求补充/维修。'
                            ]} 
                        />
                    </div>
                    <div>
                        <QuestionLabel index={7}>混凝土强度等级核查：</QuestionLabel>
                        <SelectInput 
                            value={answers['q7']} 
                            onChange={v => handleAnswerChange('q7', v)} 
                            options={STRENGTH_OPTIONS} 
                            placeholder="请选择核查强度"
                        />
                    </div>
                    <div>
                        <QuestionLabel index={8}>混凝土抗渗等级核查：</QuestionLabel>
                        <SelectInput 
                            value={answers['q8']} 
                            onChange={v => handleAnswerChange('q8', v)} 
                            options={IMPERMEABILITY_OPTIONS} 
                            placeholder="请选择抗渗等级"
                        />
                    </div>
                    <div>
                        <QuestionLabel index={9}>混凝土坍落度实测值记录：</QuestionLabel>
                        <DynamicNumberInputList 
                            values={answers['q9_list'] || ['']} 
                            onChange={v => handleAnswerChange('q9_list', v)} 
                            suffix="mm" 
                        />
                    </div>
                    <div>
                        <QuestionLabel index={10}>入模温度抽查（大体积或冬施环境，若无则填“/”）：</QuestionLabel>
                        <DynamicNumberInputList 
                            values={answers['q10_list'] || ['']} 
                            onChange={v => handleAnswerChange('q10_list', v)} 
                            suffix="℃"
                            placeholder="/" 
                        />
                    </div>
                    <div>
                        <QuestionLabel index={11}>混凝土试块留置组数统计：</QuestionLabel>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-3">
                            <NumberInput label="共留置总组数" value={answers['q11_total']} onChange={v => handleAnswerChange('q11_total', v)} suffix="组" />
                            <div className="h-px bg-gray-200 my-2"></div>
                            <div className="grid grid-cols-1 gap-2">
                                <NumberInput label="标准养护" value={answers['q11_standard']} onChange={v => handleAnswerChange('q11_standard', v)} suffix="组" />
                                <NumberInput label="同条件养护" value={answers['q11_same']} onChange={v => handleAnswerChange('q11_same', v)} suffix="组" />
                                <NumberInput label="抗渗试块" value={answers['q11_impermeability']} onChange={v => handleAnswerChange('q11_impermeability', v)} suffix="组" />
                                <NumberInput label="抗折试块" value={answers['q11_flexural']} onChange={v => handleAnswerChange('q11_flexural', v)} suffix="组" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- Part 3 --- */}
                <SectionTitle>第三部分：发现的问题及处理情况</SectionTitle>

                <div className="space-y-6">
                    <div>
                        <QuestionLabel index={12}>施工现场异常情况描述：</QuestionLabel>
                        <RadioGroup 
                            name="q12" 
                            value={answers['q12']} 
                            onChange={(v) => handleAnswerChange('q12', v)} 
                            options={[
                                'A. 施工过程平稳，未发现违规操作或质量安全隐患。',
                                'B. 施工过程中发现问题，处理情况如下（请在下题详细说明）。'
                            ]} 
                        />
                    </div>
                    <div>
                        <QuestionLabel index={13}>问题及处理过程详细记录（若有问题请填写）：</QuestionLabel>
                        <div className="relative">
                            <textarea
                                value={answers['q13'] || ''}
                                onChange={(e) => handleAnswerChange('q13', e.target.value)}
                                className="w-full h-32 p-3 pb-12 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="点击右下角话筒，通过AI语音转写输入详情..."
                            />
                            {/* AI Voice Input Button */}
                            <button
                                type="button"
                                onClick={isRecording ? stopRecording : startRecording}
                                disabled={isTranscribing}
                                className={`absolute right-2 bottom-2 p-2 rounded-full shadow-lg transition-all flex items-center gap-2 ${isRecording ? 'bg-red-500 text-white w-auto px-4' : 'bg-blue-600 text-white w-10 h-10 justify-center'}`}
                            >
                                {isTranscribing ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : isRecording ? (
                                    <>
                                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                        <span className="text-xs font-bold">停止录音</span>
                                    </>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                        <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                                        <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </Layout>
    );
};

export default ConcreteForm;
