
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { ConcreteRecord } from '../types';
import { getConcreteRecordById } from '../services/storageService';

const escapeHtml = (value: string | number | null | undefined) => String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return map[char];
});

const ConcreteReport: React.FC = () => {
  const { projectId, recordId } = useParams<{ projectId: string, recordId: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<ConcreteRecord | null>(null);
  
  // Editable State for the Main Text Areas
  const [constructionText, setConstructionText] = useState('');
  const [problemText, setProblemText] = useState('');
  
  // Preview State
  const [showPreview, setShowPreview] = useState(false);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const init = async () => {
        if (recordId) {
            const data = await getConcreteRecordById(recordId);
            if (data) {
                setRecord(data);
                generateNarratives(data.data);
            }
        }
    };
    init();
  }, [recordId]);

  // Generate the narrative text from structured data
  const generateNarratives = (data: any) => {
      // 1. Construction Situation (施工情况)
      const parts: string[] = [];
      let idx = 1; // Auto-increment index
      
      // Q1: Resource Input (Personnel)
      const workers = data.q1_workers ? `施工人员${data.q1_workers}人` : '';
      const tech = data.q1_tech ? `技术员${data.q1_tech}人` : '';
      const safety = data.q1_safety ? `安全员${data.q1_safety}人` : '';
      const people = [workers, tech, safety].filter(Boolean).join('，');
      if (people) parts.push(`${idx++}. 现场人员投入：${people}。`);

      // Q2: Resource Input (Machinery)
      const pumps = data.q2_pumps ? `泵车${data.q2_pumps}辆` : '';
      const vibrators = data.q2_vibrators ? `振捣棒${data.q2_vibrators}根` : '';
      const machines = [pumps, vibrators].filter(Boolean).join('，');
      if (machines) parts.push(`${idx++}. 施工机具投入：${machines}。`);

      // Q3: Concrete Specs
      const strength = data.q3_strength ? `强度${data.q3_strength}` : '';
      const slumpReq = data.q3_slump ? `设计坍落度${data.q3_slump}mm` : '';
      const volume = data.q3_volume ? `计划浇筑方量约${data.q3_volume}m³` : '';
      const specs = [strength, slumpReq, volume].filter(Boolean).join('，');
      if (specs) parts.push(`${idx++}. 混凝土设计要求：${specs}。`);

      // Q4: Process Checks (Preparation)
      if (data.q4) {
          const q4Status = data.q4.includes('已落实') ? '符合要求' : '存在不足（见问题记录）';
          parts.push(`${idx++}. 施工准备：技术交底及施工方案交底已检查，${q4Status}。`);
      }

      // Q5: Electricity Check
      if (data.q5) {
          const q5Status = data.q5.includes('符合') ? '符合规范要求' : '存在隐患（见问题记录）';
          parts.push(`${idx++}. 临时用电：现场施工用电检查${q5Status}。`);
      }
      
      // Q6: Management Status
      if (data.q6) {
          const q6Status = data.q6.includes('正常') ? '管理人员在岗，机具运转正常' : '管理人员缺位或机具故障（见问题记录）';
          parts.push(`${idx++}. 现场管理：${q6Status}。`);
      }

      // Q7 & Q8: Material Check
      if (data.q7 || data.q8) {
          const sCheck = data.q7 ? `强度等级${data.q7}` : '';
          const pCheck = data.q8 ? `抗渗等级${data.q8}` : '';
          const checks = [sCheck, pCheck].filter(Boolean).join('，');
          parts.push(`${idx++}. 混凝土核查：核对配送单，${checks}，符合设计要求。`);
      }
      
      // Q9 & Q10: Measurements
      const measurements = [];
      if (data.q9_list && data.q9_list.some((v: string) => v && v.trim() !== '')) {
          measurements.push(`坍落度抽查${data.q9_list.length}次（实测值：${data.q9_list.filter(Boolean).join('mm, ')}mm）`);
      }
      if (data.q10_list && data.q10_list.some((v: string) => v && v !== '/')) {
          measurements.push(`入模温度抽查（实测值：${data.q10_list.filter((v: string) => v && v !== '/').join('℃, ')}℃）`);
      }
      if (measurements.length > 0) {
          parts.push(`${idx++}. 实测实量：${measurements.join('；')}，数据真实有效。`);
      }
      
      // Q11: Test Blocks
      const total = data.q11_total;
      if (total) {
          const blocks = [];
          if (data.q11_standard) blocks.push(`标养${data.q11_standard}组`);
          if (data.q11_same) blocks.push(`同条件${data.q11_same}组`);
          if (data.q11_impermeability) blocks.push(`抗渗${data.q11_impermeability}组`);
          if (data.q11_flexural) blocks.push(`抗折${data.q11_flexural}组`);
          
          parts.push(`${idx++}. 见证取样：共留置试块${total}组${blocks.length > 0 ? `（${blocks.join('，')}）` : ''}。`);
      }

      setConstructionText(parts.join('\n'));

      // 2. Problems & Treatment (发现的问题及处理情况)
      const problemParts: string[] = [];
      
      // Auto-detect problems from Q4, Q5, Q6 choices (Option B is usually negative)
      if (data.q4 && !data.q4.includes('已落实')) problemParts.push("1. 施工前检查发现安全技术交底或施工方案交底不完善，已要求整改。");
      if (data.q5 && !data.q5.includes('符合')) problemParts.push("2. 现场施工临时用电存在安全隐患，已责令电工处理。");
      if (data.q6 && !data.q6.includes('正常')) problemParts.push("3. 现场管理人员不足或施工机具出现故障，已要求协调解决。");

      // Q12: General Status
      const isSmooth = data.q12?.includes('平稳');
      
      if (isSmooth && problemParts.length === 0) {
          problemParts.push("施工过程平稳，未发现违规操作或质量安全隐患。");
      } else if (problemParts.length === 0) {
          problemParts.push("施工过程中发现如下异常情况：");
      }
      
      // Q13: Detailed Description
      if (data.q13) {
          problemParts.push(data.q13);
      }
      
      setProblemText(problemParts.join('\n'));
  };

  // Calculate scale for preview
  useEffect(() => {
    if (showPreview) {
        const handleResize = () => {
            const a4WidthPx = 794; 
            const availableWidth = window.innerWidth - 32;
            setScale(availableWidth < a4WidthPx ? availableWidth / a4WidthPx : 1);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }
  }, [showPreview]);

  // Helper to parse "2024-03-20T14:30" into date components
  const parseDateTime = (isoStr: string) => {
      if (!isoStr) return { Y: ' ', M: ' ', D: ' ', h: ' ', m: ' ' };
      try {
          const d = new Date(isoStr);
          return {
              Y: d.getFullYear(),
              M: d.getMonth() + 1,
              D: d.getDate(),
              h: d.getHours(),
              m: d.getMinutes().toString().padStart(2, '0')
          };
      } catch (e) {
          return { Y: ' ', M: ' ', D: ' ', h: ' ', m: ' ' };
      }
  };

  const getPrintHtml = () => {
    if (!record) return '';
    const d = record.data;
    
    const startT = parseDateTime(d.info_start_time);
    const endT = parseDateTime(d.info_end_time);

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <title>旁站记录 - ${escapeHtml(d.info_part)}</title>
        <style>
          @page { size: A4 portrait; margin: 20mm; }
          body { 
            font-family: "SimSun", "Songti SC", serif; 
            color: #000; 
            background: white;
            -webkit-print-color-adjust: exact;
            margin: 0;
            padding: 0;
          }
          /* Screen simulation */
          @media screen {
            body {
                width: 210mm;
                min-height: 297mm;
                padding: 20mm;
                box-sizing: border-box;
            }
          }
          @media print {
            body { width: auto; padding: 0; }
          }

          h1 { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 20px; letter-spacing: 2px; }
          
          .header-info { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 5px; }
          
          table { width: 100%; border-collapse: collapse; border: 2px solid black; table-layout: fixed; }
          td { border: 1px solid black; padding: 5px; vertical-align: middle; font-size: 14px; word-break: break-all; }
          
          .center { text-align: center; }
          .label { font-weight: normal; } /* Standard table font is usually normal weight in these docs */
          
          .h-40 { height: 40px; }
          .h-big { height: 350px; vertical-align: top; padding: 10px; }
          .h-med { height: 200px; vertical-align: top; padding: 10px; }
          
          .sign-area {
              display: flex;
              justify-content: flex-end;
              align-items: center;
              margin-top: 50px;
              gap: 10px;
          }
          .date-area {
              display: flex;
              justify-content: flex-end;
              margin-top: 10px;
              gap: 15px;
          }
          .footer-note { font-size: 12px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <h1>表 A.9 旁站记录</h1>
        
        <div class="header-info">
            <span>工程名称：${escapeHtml(d.info_project_name)}</span>
            <span>编号：${escapeHtml(d.info_project_number)}</span>
        </div>

        <table>
            <colgroup>
                <col style="width: 15%">
                <col style="width: 35%">
                <col style="width: 15%">
                <col style="width: 35%">
            </colgroup>
            
            <tr class="h-40">
                <td class="center">单位工程名称</td>
                <td colspan="3">${escapeHtml(d.info_unit_name)}</td>
            </tr>
            
            <tr class="h-40">
                <td class="center">旁站部位<br>(工序)</td>
                <td>${escapeHtml(d.info_part)}</td>
                <td class="center">施工单位</td>
                <td>${escapeHtml(d.info_constructor)}</td>
            </tr>
            
            <tr class="h-40">
                <td class="center">旁站开始时间</td>
                <td class="center">
                    ${escapeHtml(startT.Y)} 年 ${escapeHtml(startT.M)} 月 ${escapeHtml(startT.D)} 日 ${escapeHtml(startT.h)} 时 ${escapeHtml(startT.m)} 分
                </td>
                <td class="center">旁站结束时间</td>
                <td class="center">
                    ${escapeHtml(endT.Y)} 年 ${escapeHtml(endT.M)} 月 ${escapeHtml(endT.D)} 日 ${escapeHtml(endT.h)} 时 ${escapeHtml(endT.m)} 分
                </td>
            </tr>
            
            <tr class="h-40">
                <td class="center">天气情况</td>
                <td colspan="3">${escapeHtml(d.info_weather)}</td>
            </tr>
            
            <tr>
                <td colspan="4" class="h-big">
                    <div>旁站部位（工序）施工情况：</div>
                    <div style="margin-top: 10px; text-indent: 2em; line-height: 1.8;">
                        ${escapeHtml(constructionText).replace(/\n/g, '<br>')}
                    </div>
                </td>
            </tr>
            
            <tr>
                <td colspan="4" class="h-med">
                    <div>发现的问题及处理情况：</div>
                    <div style="margin-top: 10px; text-indent: 2em; line-height: 1.8;">
                        ${escapeHtml(problemText).replace(/\n/g, '<br>')}
                    </div>
                    
                    <div class="sign-area">
                        <span>旁站监理人员（签字）：</span>
                        <span style="width: 100px; border-bottom: 1px solid black;"></span>
                    </div>
                    <div class="date-area">
                        <span>年</span>
                        <span>月</span>
                        <span>日</span>
                    </div>
                </td>
            </tr>
        </table>
        
        <div class="footer-note">注：本表项目监理机构留存。</div>
      </body>
      </html>
    `;
  };

  const handleDownload = () => {
    const content = getPrintHtml();
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `旁站记录_${record?.date}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
      const content = getPrintHtml();
      const printScript = `
        <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 500); }
        </script>
      `;
      const finalHtml = content.replace('</body>', `${printScript}</body>`);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(finalHtml);
          printWindow.document.close();
      } else {
          alert("无法打开打印窗口");
      }
  };

  if (!record) return <div className="p-8 text-center">加载中...</div>;

  return (
    <>
    <div className="h-full flex flex-col">
        <Layout 
            title="旁站记录预览" 
            showBack 
            onBack={() => navigate(`/project/${projectId}/side/concrete/${recordId}`)} 
        >
            <div className="flex-1 overflow-y-auto bg-gray-50 pb-24 px-4 pt-4">
                
                {/* Editor Areas */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-4">
                    <div className="px-4 py-3 bg-blue-50 border-b border-gray-100 flex items-center gap-2">
                        <span className="font-bold text-blue-800">旁站部位（工序）施工情况</span>
                    </div>
                    <textarea
                        value={constructionText}
                        onChange={(e) => setConstructionText(e.target.value)}
                        className="w-full p-4 text-[15px] leading-relaxed text-gray-700 outline-none resize-none min-h-[200px]"
                    />
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-4">
                    <div className="px-4 py-3 bg-red-50 border-b border-gray-100 flex items-center gap-2">
                        <span className="font-bold text-red-800">发现的问题及处理情况</span>
                    </div>
                    <textarea
                        value={problemText}
                        onChange={(e) => setProblemText(e.target.value)}
                        className="w-full p-4 text-[15px] leading-relaxed text-gray-700 outline-none resize-none min-h-[150px]"
                    />
                </div>

                {/* Floating Button */}
                <div className="fixed bottom-6 left-6 right-6 z-20">
                    <button 
                        onClick={() => setShowPreview(true)}
                        className="w-full h-12 rounded-full font-bold shadow-lg flex items-center justify-center gap-2 transition-all bg-[#07C160] hover:bg-[#06ad56] active:scale-95 text-white"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        生成表格 (表 A.9)
                    </button>
                </div>
            </div>
        </Layout>
    </div>

    {/* Preview Modal */}
    {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
             <div className="bg-white p-4 flex justify-between items-center shadow-md z-10 shrink-0">
                 <h3 className="font-bold text-lg text-gray-800">打印预览</h3>
                 <button onClick={() => setShowPreview(false)} className="p-2 bg-gray-100 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
             </div>
             
             <div className="flex-1 overflow-auto p-4 bg-gray-600 flex flex-col items-center">
                 <div style={{ width: `${794 * scale}px`, height: `${1123 * scale}px`, flexShrink: 0, marginTop: '1rem', marginBottom: '1rem' }}>
                     <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: '794px', height: '1123px' }}>
                         <iframe title="Preview" srcDoc={getPrintHtml()} className="bg-white shadow-2xl" style={{ width: '100%', height: '100%', border: 'none' }} />
                     </div>
                 </div>
             </div>
             
             <div className="bg-white p-4 border-t border-gray-200 flex justify-end gap-3 safe-area-bottom shrink-0">
                 <button onClick={handleDownload} className="flex-1 px-4 py-2 rounded-lg text-gray-700 bg-gray-100 font-medium">下载文件</button>
                 <button onClick={handlePrint} className="flex-1 px-4 py-2 rounded-lg bg-[#07C160] text-white font-bold">立即打印</button>
             </div>
        </div>
    )}
    </>
  );
};

export default ConcreteReport;
