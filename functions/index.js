// functions/index.js
const functions = require("firebase-functions/v1");
const fetch = require("node-fetch");

exports.callGeminiRatKing = functions.https.onCall(async (data, context) => {
  // (可選) 檢查使用者是否已通過 Firebase Authentication 驗證
  // if (!context.auth) {
  //   throw new functions.https.HttpsError(
  //     "unauthenticated",
  //     "The function must be called while authenticated."
  //   );
  // }

  const promptText = data.promptText;
  // eslint-disable-next-line no-unused-vars
  const model = data.model || "gemini-1.5-flash-latest";

  if (!promptText) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with \"promptText\" data.",
    );
  }

  // 從 Firebase 環境變數讀取 Gemini API 金鑰
  const geminiApiKey = functions.config().gemini ?
    functions.config().gemini.key :
    process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    console.error(
        "Gemini API Key is not configured in environment variables.",
    );
    throw new functions.https.HttpsError(
        "internal",
        "The Gemini API key is not configured on the server.",
    );
  }

  // Gemini API 的網址
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

  const payload = {
    contents: [{role: "user", parts: [{text: promptText}]}],
    // 您也可以在這裡加入額外的安全設定或內容過濾 (safetySettings)
    // 例如：
    // safetySettings: [
    //   { category: "HARM_CATEGORY_HARASSMENT",
    //     threshold: "BLOCK_NONE" },
    //   { category: "HARM_CATEGORY_HATE_SPEECH",
    //     threshold: "BLOCK_NONE" },
    //   { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    //     threshold: "BLOCK_NONE" },
    //   { category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    //     threshold: "BLOCK_NONE" },
    // ],
  }; // <--- 確保 payload 物件在這裡正確結束

  try { // <--- try 關鍵字現在應該在正確的位置
    console.log("Calling Gemini API with prompt:", promptText);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API Error (${response.status}): ${errorBody}`);
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error && errorJson.error.message) {
          throw new functions.https.HttpsError(
              "internal",
              `Gemini API Error: ${errorJson.error.message}`,
          );
        }
      } catch (parseError) {
        // 如果無法解析 JSON，則返回原始錯誤文本
      }
      throw new functions.https.HttpsError(
          "internal",
          `Gemini API request failed with status ${response.status}.`,
      );
    }

    const result = await response.json();
    console.log("Gemini API Raw Result:", result);

    if (result.candidates && result.candidates.length > 0) {
      if (result.candidates[0].finishReason === "SAFETY") {
        console.warn(
            "Gemini API response blocked due to safety reasons:",
            result.candidates[0].safetyRatings,
        );
        throw new functions.https.HttpsError(
            "invalid-argument",
            "請求的回應內容因安全考量被阻擋。",
        );
      }
      if (
        result.candidates[0].content &&
        result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0
      ) {
        return {text: result.candidates[0].content.parts[0].text};
      }
    }

    if (result.promptFeedback && result.promptFeedback.blockReason) {
      console.warn("Gemini API blocked prompt:", result.promptFeedback);
      throw new functions.https.HttpsError(
          "invalid-argument",
          `您的請求因 ${result.promptFeedback.blockReason} 而被 Gemini API 阻擋。`,
      );
    }

    console.error(
        "Unexpected Gemini API response structure or no content:",
        result,
    );
    throw new functions.https.HttpsError(
        "internal",
        "Unexpected response structure from Gemini API or no content.",
    );
  } catch (error) {
    console.error("Error calling Gemini API from Cloud Function:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError(
        "internal",
        "Failed to call Gemini API.",
    );
  }
});
