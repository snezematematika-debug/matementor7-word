
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SYSTEM_PERSONA } from "../constants";
import { QuizQuestion, GeneratedLesson, GeneratedScenario } from "../types";

// Helper to safely get the API client
const getAiClient = () => {
  let apiKey = '';

  // 1. Try process.env (Standard Node/Webpack/Vite define)
  if (typeof process !== 'undefined' && process.env) {
    apiKey = process.env.API_KEY || process.env.VITE_API_KEY || '';
  }

  // 2. Try import.meta.env (Vite Standard for Browser)
  // We use try-catch and casting to avoid TS/runtime errors in different environments
  if (!apiKey) {
    try {
      // @ts-ignore
      const metaEnv = import.meta?.env;
      if (metaEnv) {
        apiKey = metaEnv.VITE_API_KEY || metaEnv.API_KEY || '';
      }
    } catch (e) {
      // Ignore errors if import.meta is not available
    }
  }

  if (!apiKey) {
    console.error("API_KEY is missing. Ensure it is set in your Vercel Environment Variables.");
    throw new Error("Не е пронајден API Key. Ве молиме додадете 'API_KEY' или 'VITE_API_KEY' во Vercel Environment Variables.");
  }

  return new GoogleGenAI({ apiKey });
};

// Common instruction for Math Formatting - UPDATED TO FORBID LATEX IN JSON
const MATH_INSTRUCTION = `
ВАЖНО ЗА ФОРМАТИРАЊЕ И JSON (СТРОГИ ПРАВИЛА):
1. Враќај ЧИТЛИВ ТЕКСТ.
2. ЗАБРАНЕТО Е КОРИСТЕЊЕ НА LATEX СИНТАКСА ($...$, \\frac, \\pi, \\circ) во JSON вредностите.
3. ЗАБРАНЕТО Е КОРИСТЕЊЕ НА КОСИ ЦРТИ (BACKSLASHES \\) бидејќи тие го рушат JSON форматот.
4. Наместо LaTeX, користи UNICODE симболи и обичен текст:
   - π (Unicode) наместо \\pi
   - ° (Unicode) наместо ^\\circ
   - ² (Unicode) наместо ^2
   - ³ (Unicode) наместо ^3
   - √ (Unicode) наместо \\sqrt
   - Δ (Unicode) наместо \\triangle
   - α, β, γ (Unicode) за агли.
   - P = 2·r·π (обичен запис).
5. За болдирање користи **текст**.
`;

// Helper function to handle JSON parsing more robustly
const parseJsonSafe = (text: string) => {
    if (!text) return null;

    // 0. Pre-clean common AI artifacts
    // Replace "svg <svg" with "<svg" (case insensitive) to fix visualization glitch
    let clean = text.replace(/svg\s*<svg/gi, '<svg');
    // Replace "svg ```" with "```" (case insensitive)
    clean = clean.replace(/svg\s*```/gi, '```');

    // 1. Remove Markdown code blocks if present
    clean = clean.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
        return JSON.parse(clean);
    } catch (e) {
        console.warn("Standard JSON parse failed, attempting fallback...", e);
        try {
            // 2. Fallback: If AI still messed up backslashes despite instructions
            const fixed = clean.replace(/\\/g, '/'); // Replace all backslashes with forward slashes as a last resort
            return JSON.parse(fixed);
        } catch (e2) {
            console.error("Auto-fix failed. Original text:", text);
            throw new Error("Неуспешно читање на одговорот од AI (Invalid JSON). Ве молиме обидете се повторно.");
        }
    }
};

export const generateLessonContent = async (topic: string, grade: string, includeContext: boolean = false): Promise<GeneratedLesson> => {
  try {
    const ai = getAiClient();
    
    let contextInstruction = "";
    if (includeContext) {
      contextInstruction = `
      ДОПОЛНИТЕЛНА СЕКЦИЈА (ЗАДОЛЖИТЕЛНО):
      Вклучи посебна секција на крајот (пред задачите за вежбање) насловена '🌍 Математика околу нас'.
      Во оваа секција, објасни го концептот користејќи примери блиски за модерните тинејџери (на пр. Видео игри, Социјални мрежи, Спорт, Шопинг/Попусти, Пари).
      Користи пристап на раскажување приказни (Story Problems) за да покажеш зошто е ова важно.
      `;
    }

    const prompt = `
      Креирај лекција за VII одделение на тема: "${topic}".
      Лекцијата треба да биде интерактивна и разбирлива.
      
      Структура:
      1. Наслов.
      2. Што ќе научиме (3 цели).
      3. Главен дел (Дефиниции, Својства, Примери).
      ${includeContext ? "4. 🌍 Математика околу нас (Contextual Learning)." : ""}
      ${includeContext ? "5." : "4."} Задача за вежбање.
      ${includeContext ? "6." : "5."} 🏠 Предлог за домашна работа (со посебен дел за решенија).
      
      ${contextInstruction}

      СЕКЦИЈА ЗА ДОМАШНА РАБОТА (СПЕЦИФИЧЕН ФОРМАТ):
      На самиот крај на содржината, додај наслов "### 🏠 Предлог за домашна работа".
      1. Генерирај 3 до 5 текстуални задачи (растечка тежина) БЕЗ РЕШЕНИЈА веднаш до нив.
      2. Веднаш по задачите, додај сепаратор (хоризонтална линија: ---).
      3. Под линијата, додај нов наслов "### 🔑 Решенија (Само за наставникот)".
      4. Тука напиши ги решенијата нумерирани исто како задачите (на пр. "1. x=5").
      
      ВИЗУЕЛИЗАЦИЈА (SVG ДИЈАГРАМИ):
      Ако лекцијата вклучува геометриски форми, агли, координатни системи или графички приказ на податоци, ЗАДОЛЖИТЕЛНО генерирај SVG код.
      
      ИНСТРУКЦИИ ЗА SVG:
      1. Вметни го SVG кодот ДИРЕКТНО во текстот како обичен HTML.
      2. НЕ КОРИСТИ CODE BLOCKS (на пр. \`\`\`svg ... \`\`\`). 
      3. Напиши го само тагот: <svg viewBox="0 0 300 200" ...> ... </svg>
      4. Осигурај се дека сите тагови се правилно затворени.
      5. Користи црни линии (stroke="black") и јасни ознаки.

      ${MATH_INSTRUCTION}

      Врати JSON:
      {
        "title": "String",
        "objectives": ["String", "String", "String"],
        "content": "String (Markdown + Unicode Math + Raw HTML SVG)"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PERSONA,
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response content");
    
    return parseJsonSafe(text) as GeneratedLesson;
  } catch (error: any) {
    console.error("Lesson generation error:", error);
    throw new Error(error.message || "Failed to generate lesson");
  }
};

export const generateScenarioContent = async (topic: string): Promise<GeneratedScenario> => {
    try {
      const ai = getAiClient();
      
      const prompt = `
        Креирај детално Сценарио за час по математика за VII одделение на тема: "${topic}".
        Пополни ги полињата за да одговараат на официјалниот формат за подготовки.
        
        ${MATH_INSTRUCTION}
        
        Биди конкретен, методичен и јасен.
        Врати JSON формат со следните полиња (сите се string):
        - topic: Насловот на темата.
        - standards: Стандарди за оценување (Користи булети).
        - content: Содржина и нови поими кои се воведуваат.
        - introActivity: Опис на воведната активност (околу 10 мин).
        - mainActivity: Опис на главните активности, работа во групи, задачи (околу 20-25 мин). Користи Unicode за формули.
        - finalActivity: Завршна активност, рефлексија и домашна работа (околу 10 мин).
        - resources: Потребни средства и материјали.
        - assessment: Начини на следење на напредокот.
      `;
  
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PERSONA,
          responseMimeType: "application/json",
        }
      });
  
      const text = response.text;
      if (!text) throw new Error("No response content");
      
      return parseJsonSafe(text) as GeneratedScenario;
    } catch (error: any) {
      console.error("Scenario generation error:", error);
      throw new Error(error.message || "Failed to generate scenario");
    }
  };

export const generateQuizQuestions = async (topic: string, grade: string): Promise<{questions: QuizQuestion[], rubric: string}> => {
  try {
    const ai = getAiClient();

    const prompt = `
      Генерирај 5 прашања за геометрија, тема: "${topic}" (VII одделение).
      Прашањата треба да бидат соодветни за возраста.
      
      ОСВЕН ПРАШАЊАТА, ГЕНЕРИРАЈ И ДЕТАЛНА "РУБРИКА ЗА ОЦЕНУВАЊЕ" (Rubric/Teacher Guide).
      
      ИНСТРУКЦИИ ЗА ФОРМАТИРАЊЕ НА РУБРИКАТА (СТРОГО):
      1. Рубриката мора да биде во MARKDOWN формат.
      2. Користи '###' за наслови на секциите.
      3. Користи '---' за хоризонтални линии за одделување.
      4. СЕКОЈА ставка во листите мора да биде во НОВ РЕД.
      
      СТРУКТУРА ШТО МОРА ДА ЈА СЛЕДИШ:
      
      ### 1. Матрица на одговори и цели
      (Наведи го точниот одговор, поените и што конкретно проверува задачата)
      * **Прашање 1:** Одговор [Буква] (5 поени) — [Краток опис на целта, на пр. Препознавање на прав агол]
      * **Прашање 2:** Одговор [Буква] (5 поени) — [Цел...]
      * **Прашање 3:** Одговор [Буква] (5 поени) — [Цел...]
      * **Прашање 4:** Одговор [Буква] (5 поени) — [Цел...]
      * **Прашање 5:** Одговор [Буква] (5 поени) — [Цел...]
      
      ---
      
      ### 2. Критериуми за бодирање
      * **5 поени:** Точен одговор.
      * **0 поени:** Неточен одговор.
      
      ---
      
      ### 3. Скала за оценување
      * **0-9 поени:** Недоволен (1)
      * **10-14 поени:** Доволен (2)
      * **15-19 поени:** Добар (3)
      * **20-22 поени:** Многу добар (4)
      * **23-25 поени:** Одличен (5)
      
      ${MATH_INSTRUCTION}
    `;

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswerIndex: { type: Type.INTEGER },
              explanation: { type: Type.STRING },
              difficulty: { type: Type.STRING, enum: ['Лесно', 'Средно', 'Тешко'] }
            },
            required: ['question', 'options', 'correctAnswerIndex', 'explanation', 'difficulty']
          }
        },
        rubric: {
           type: Type.STRING,
           description: "Markdown formatted rubric text containing correct answers and grading criteria."
        }
      },
      required: ['questions', 'rubric']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PERSONA,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const text = response.text;
    if (!text) return { questions: [], rubric: '' };
    const result = parseJsonSafe(text);
    return result as {questions: QuizQuestion[], rubric: string};
  } catch (error: any) {
    console.error("Quiz generation error:", error);
    throw new Error(error.message || "Failed to generate quiz");
  }
};

export const generateWorksheet = async (topic: string, type: 'STANDARD' | 'DIFFERENTIATED' | 'EXIT_TICKET' = 'STANDARD'): Promise<string> => {
  try {
    const ai = getAiClient();

    let structureInstruction = "";

    if (type === 'EXIT_TICKET') {
        structureInstruction = `
        ТИП: ИЗЛЕЗНО ЛИВЧЕ (EXIT TICKET)
        
        ИНСТРУКЦИИ ЗА ЛАЈАУТ (МНОГУ ВАЖНО):
        Креирај ДВЕ ИДЕНТИЧНИ КОПИИ од излезното ливче на истата страница, одделени со хоризонтална линија (---).
        Ова е за да може наставникот да печати еднаш и да сече на половина (Eco-friendly).
        
        СОДРЖИНА НА ЕДНО ЛИВЧЕ:
        Наслов: "Излезно Ливче: ${topic}"
        1. Секција: "3 работи што ги научив денес..." (Остави празни линии за пишување)
        2. Секција: "2 работи што ми беа интересни..." (Остави празни линии)
        3. Секција: "1 прашање што се уште го имам..." (Остави празни линии)
        4. Секција: "Задача за проверка" (1 кратка математичка задача поврзана со лекцијата)
        
        Повтори го ова два пати во Markdown одговорот.
        `;
    } else if (type === 'DIFFERENTIATED') {
      structureInstruction = `
      СТРУКТУРА НА РАБОТНИОТ ЛИСТ (ЗАДОЛЖИТЕЛНО ПОДЕЛИ ГИ ЗАДАЧИТЕ ВАКА):

      ### 🟢 ГРУПА А: Почетно ниво (Basic tasks for understanding the concept)
      (3-4 едноставни задачи за проверка на основните поими и директна примена)

      ### 🟡 ГРУПА Б: Средно ниво (Standard practice tasks)
      (3-4 стандардни текстуални задачи, типични за писмена работа)

      ### 🔴 ГРУПА В: Напредно ниво (Logical problems and challenges for talented students)
      (2 сложени логички задачи или предизвици за талентирани ученици)
      `;
    } else {
      structureInstruction = `
      Содржина:
      - 5 текстуални задачи со различно ниво на тежина (од полесни кон потешки).
      `;
    }

    const prompt = `
      Креирај Работен Лист (Worksheet) за ученици по математика (VII одделение).
      Тема: "${topic}".
      
      ${structureInstruction}
      
      - Задачите треба да се јасни и прецизни.
      - Не вклучувај решенија, само задачи за вежбање (освен ако е Излезно Ливче каде задачата е кратка).
      
      ГЕОМЕТРИСКИ ДИЈАГРАМИ:
      - Ако задачата бара слика, ГЕНЕРИРАЈ SVG КОД.
      - Вметни го SVG кодот ДИРЕКТНО како HTML тагови <svg>...</svg>.
      - НЕ КОРИСТИ Code Blocks.
      - SVG-то треба да биде црно-бело, јасно и со димензии 300x200.
      
      Формат на одговорот:
      Врати го текстот директно во Markdown формат. Користи наслови, bold текст и нумерирани листи.
      Користи Unicode за математички симболи.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PERSONA,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response content");
    
    // Clean response before returning
    let clean = text.replace(/svg\s*<svg/gi, '<svg');
    clean = clean.replace(/svg\s*```/gi, '```');
    return clean;

  } catch (error: any) {
    console.error("Worksheet generation error:", error);
    throw new Error(error.message || "Failed to generate worksheet");
  }
};

export const generateProject = async (topic: string): Promise<string> => {
    try {
      const ai = getAiClient();
  
      const prompt = `
        You are a helpful teacher assistant. Generate the response STRICTLY IN MACEDONIAN LANGUAGE.
        
        Task: Create a STEAM or real-world math project based on the lesson: "${topic}" (7th Grade Math).
        
        The project should encourage creativity, critical thinking, and application of math in real life.
        
        Structure the response in Markdown with the following specific sections:
        
        # Наслов на проектот
        (A creative and engaging title)
        
        ## Цел на проектот
        (Explain the learning goal and the real-world connection. Why is this useful?)
        
        ## Потребни материјали
        (A bulleted list of items needed, e.g., ruler, cardboard, scissors, internet, etc.)
        
        ## Чекори за работа
        (Detailed step-by-step instructions for the students on how to execute the project)
        
        ## Критериуми за оценување
        (A simple Markdown table (Rubric) showing how points are awarded for Accuracy, Creativity, and Presentation)
        
        Do not include intro/outro conversational text, just the project content.
      `;
  
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PERSONA,
        }
      });
  
      const text = response.text;
      if (!text) throw new Error("No response content");
      
      return text;
    } catch (error: any) {
      console.error("Project generation error:", error);
      throw new Error(error.message || "Failed to generate project");
    }
};

export const generateCanvasAnimation = async (description: string): Promise<string> => {
  try {
    const ai = getAiClient();

    const prompt = `
      Act as an expert Educational Math Visualizer.
      Write a JavaScript function body for an HTML5 Canvas animation about: "${description}".
      
      The function signature is: function draw(ctx, width, height, frame) { ... }
      
      VISUAL STYLE GUIDELINES (Whiteboard/Notebook Style):
      1. **Background**: The canvas is transparent with a CSS grid behind it. DO NOT fill the background. Start with 'ctx.clearRect(0, 0, width, height)'.
      2. **Line Quality**: Use thick lines (lineWidth = 3 or 4) for visibility.
      3. **Colors**: 
         - Main Geometry: Black (#000000) or Dark Blue (#1e3a8a).
         - Highlights/Angles/Points: Bright Red (#dc2626) or Dark Orange (#ea580c).
         - Text/Labels: Black (#000000) with '16px sans-serif' font.
      4. **Animation Speed**: MAKE IT SLOW. Math concepts need time to be absorbed. Use slow transitions (e.g., use 'frame * 0.005' or 'frame * 0.01'). A full cycle should take 3-5 seconds.
      5. **Dynamic Labels**: Text labels (e.g., "A", "B", "r", "α") MUST move with the geometric elements. Show changing values (like angles in degrees) if relevant.
      6. **Construction**: If possible, show the shape being constructed (drawing the line) rather than just moving it.

      CODE REQUIREMENTS:
      - Use standard Canvas API (ctx.beginPath, ctx.moveTo, ctx.lineTo, ctx.stroke, ctx.arc, ctx.fillText).
      - Use 'frame' variable to drive animation state.
      - Return ONLY the raw JavaScript code for the function body. NO markdown blocks.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a JavaScript Canvas expert for educational software. You produce clean, high-performance, and visually clear code.",
      }
    });

    // Strip markdown code blocks if present
    let code = response.text || "";
    code = code.replace(/```javascript/g, "").replace(/```js/g, "").replace(/```/g, "");
    return code;
  } catch (error: any) {
    console.error("Canvas generation error:", error);
    throw new Error(error.message || "Failed to generate animation");
  }
};
