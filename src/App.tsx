import { 
  useState, 
  useEffect, 
  useRef,
  DragEvent,
  ChangeEvent,
  FormEvent,
  MouseEvent,
  TouchEvent
} from "react";
import { 
  Mic, 
  CheckCircle2, 
  Copy, 
  Check, 
  FileUp, 
  Link as LinkIcon, 
  ArrowLeft, 
  Volume2, 
  Loader2, 
  Sparkles,
  AlertCircle,
  Send,
  X,
  FileText,
  Globe
} from "lucide-react";

// Determine API Base URL from env variable, or fallback to relative paths
const getApiUrl = (endpoint: string): string => {
  const baseUrl = (import.meta as any).env.NEXT_PUBLIC_API_URL;
  if (baseUrl) {
    const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanEndpoint}`;
  }
  return endpoint;
};

export default function App() {
  // ----------------------------------------------------
  // ROUTING & NAVIGATION
  // ----------------------------------------------------
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    setCurrentPath(to);
  };

  // Parse path: /agent/[id] or default /builder, supporting /agent/[id]/ready
  const isAgentViewState = currentPath.startsWith("/agent/");
  const isReadyState = currentPath.startsWith("/agent/") && currentPath.endsWith("/ready");
  
  const activeAgentId = currentPath.startsWith("/agent/")
    ? currentPath.split("/agent/")[1].split("/ready")[0]
    : null;

  const isAgentView = isAgentViewState && !isReadyState;

  // ----------------------------------------------------
  // TOAST NOTIFICATIONS
  // ----------------------------------------------------
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ----------------------------------------------------
  // PAGE 1: AGENT BUILDER STATE & CONVERSATIONAL ONBOARDING
  // ----------------------------------------------------
  const [businessName, setBusinessName] = useState("");
  const [greeting, setGreeting] = useState("");
  
  // Custom onboarding conversation parameters
  const [businessType, setBusinessType] = useState("");
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [topFaqs, setTopFaqs] = useState<string[]>([]);
  const [restrictions, setRestrictions] = useState("");

  const [conversationHistory, setConversationHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Namaste! Welcome to VoiceClaw. I'm your onboarding assistant. Let's build your live voice agent in just a few quick steps! To start off, what is the name of your business?"
    }
  ]);

  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    type?: "text" | "upload-widget" | "summary-card";
  }>>([
    {
      id: "init-msg",
      role: "assistant",
      content: "Namaste! Welcome to VoiceClaw. I'm your onboarding assistant. Let's build your live voice agent in just a few quick steps! To start off, what is the name of your business?",
      type: "text"
    }
  ]);

  const [chatInput, setChatInput] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isConfigDone, setIsConfigDone] = useState(false);

  // Document Management list representation inside chat upload-widget
  const [uploadedFilesList, setUploadedFilesList] = useState<string[]>([]);
  const [ingestedUrlsList, setIngestedUrlsList] = useState<string[]>([]);

  // Mobile layout state toggles
  const [isMobileConfigExpanded, setIsMobileConfigExpanded] = useState(false);

  const [urlInput, setUrlInput] = useState("");
  const [pdfName, setPdfName] = useState<string | null>(null);
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isIngestingUrl, setIsIngestingUrl] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedAgentId, setDeployedAgentId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll chat to bottom when messages or typing states change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiTyping]);

  // ----------------------------------------------------
  // CONVERSATIONAL ONBOARDING HANDLERS
  // ----------------------------------------------------
  const handleSendChatMessage = async (customText?: string) => {
    const textToSend = customText !== undefined ? customText : chatInput.trim();
    if (!textToSend) return;

    if (customText === undefined) {
      setChatInput("");
    }

    const userMsg = { role: "user" as const, content: textToSend };
    const userBubble = { id: `user-${Date.now()}`, role: "user" as const, content: textToSend, type: "text" as const };
    
    const newHistory = [...conversationHistory, userMsg];
    let newMessages = [...chatMessages, userBubble];

    setConversationHistory(newHistory);
    setChatMessages(newMessages);
    setIsAiTyping(true);

    try {
      // 1. Check if we're in the upload state and the user is answering yes/no or done
      if (isConfigDone) {
        const lowInput = textToSend.toLowerCase().trim();
        if (lowInput === "no" || lowInput === "done" || lowInput === "that's all" || lowInput.includes("nothing else") || lowInput.includes("deploy")) {
          setTimeout(() => {
            setIsAiTyping(false);
            const endText = "Perfect. Your agent is fully set up. Here's a summary of what I've configured for you:";
            
            setConversationHistory(prev => [...prev, { role: "assistant" as const, content: endText }]);
            setChatMessages(prev => [
              ...prev, 
              { id: `ai-end-${Date.now()}`, role: "assistant" as const, content: endText, type: "text" as const },
              { id: `summary-${Date.now()}`, role: "system" as const, content: "", type: "summary-card" as const }
            ]);
          }, 1200);
          return;
        }
        
        if (lowInput === "yes" || lowInput.includes("add another") || lowInput.includes("yes please")) {
          setTimeout(() => {
            setIsAiTyping(false);
            const repeatText = "Sure, go ahead! You can upload another document or enter another URL:";
            
            setConversationHistory(prev => [...prev, { role: "assistant" as const, content: repeatText }]);
            setChatMessages(prev => [
              ...prev, 
              { id: `ai-rep-${Date.now()}`, role: "assistant" as const, content: repeatText, type: "text" as const },
              { id: `widget-${Date.now()}`, role: "system" as const, content: "", type: "upload-widget" as const }
            ]);
          }, 1000);
          return;
        }
      }

      // 2. Call our intelligent Express AI proxy
      const response = await fetch(getApiUrl("/api/claude"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: `You are an onboarding assistant helping a non-technical Indian business owner set up their AI voice agent. Your job is to ask them short, friendly questions one at a time — like a consultant would — to understand their business deeply enough to configure a voice agent for them.

Ask questions in this order, one at a time, waiting for each answer:
1. What is the name of your business?
2. What kind of business is it? (restaurant, clinic, shop, etc.)
3. What language do your customers usually speak with you?
4. What are the top 3 things customers usually ask you about?
5. How do you want the agent to greet customers?
6. Is there anything the agent should never say or do?

After all 6 answers, output a JSON block wrapped in <config></config> tags with this structure:
<config>
{
  "business_name": "...",
  "business_type": "...",
  "primary_language": "...",
  "top_faqs": ["...", "...", "..."],
  "greeting": "...",
  "restrictions": "..."
}
</config>

Keep every message under 2 sentences. Be warm and conversational. Use simple English. Never ask two questions at once.`,
          messages: newHistory
        })
      });

      if (!response.ok) {
        throw new Error("Proxy response failed");
      }

      const data = await response.json();
      const rawText = data.content?.[0]?.text || "";

      parseConfigFromMessage(rawText);

      // Clean config block from user-displayed message
      const cleanText = rawText.replace(/<config>[\s\S]*?<\/config>/g, "").trim();

      const aiMsg = { role: "assistant" as const, content: cleanText };
      const aiBubble = { id: `ai-${Date.now()}`, role: "assistant" as const, content: cleanText, type: "text" as const };

      setConversationHistory(prev => [...prev, aiMsg]);
      setChatMessages(prev => [...prev, aiBubble]);

      // Check for config termination tag
      if (rawText.includes("<config>")) {
        setIsConfigDone(true);
        setTimeout(() => {
          injectUploadWidget();
        }, 1200);
      }

    } catch (e) {
      console.error(e);
      showToast("I'm having trouble responding right now. Let me try again.", "error");
    } finally {
      setIsAiTyping(false);
    }
  };

  const parseConfigFromMessage = (text: string) => {
    // Exact or partial <config> parser
    const configRegex = /<config>([\s\S]*?)<\/config>/;
    const match = text.match(configRegex);
    if (match && match[1]) {
      try {
        const cleanJson = match[1].trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed.business_name) setBusinessName(parsed.business_name);
        if (parsed.business_type) setBusinessType(parsed.business_type);
        if (parsed.primary_language) setPrimaryLanguage(parsed.primary_language);
        if (parsed.greeting) setGreeting(parsed.greeting);
        if (parsed.restrictions) setRestrictions(parsed.restrictions);
        if (parsed.top_faqs && Array.isArray(parsed.top_faqs)) {
          setTopFaqs(parsed.top_faqs);
        }
      } catch (e) {
        // Fallback or partial parameters builder
        try {
          // If JSON is incomplete, do regex extracts or simple fallback
          const cleanJson = match[1].trim();
          const nameRegex = /"business_name"\s*:\s*"([^"]+)"/;
          const typeRegex = /"business_type"\s*:\s*"([^"]+)"/;
          const langRegex = /"primary_language"\s*:\s*"([^"]+)"/;
          const greetRegex = /"greeting"\s*:\s*"([^"]+)"/;
          const restrictRegex = /"restrictions"\s*:\s*"([^"]+)"/;

          const nMatch = cleanJson.match(nameRegex);
          const tMatch = cleanJson.match(typeRegex);
          const lMatch = cleanJson.match(langRegex);
          const gMatch = cleanJson.match(greetRegex);
          const rMatch = cleanJson.match(restrictRegex);

          if (nMatch) setBusinessName(nMatch[1]);
          if (tMatch) setBusinessType(tMatch[1]);
          if (lMatch) setPrimaryLanguage(lMatch[1]);
          if (gMatch) setGreeting(gMatch[1]);
          if (rMatch) setRestrictions(rMatch[1]);
        } catch (inner) {}
      }
    }

    // Heuristics for real-time incremental extracts from messages
    const textLower = text.toLowerCase();
    // Try to match basic names or keywords if JSON is not ready yet
    if (!businessName) {
      const introMatch = text.match(/hotel|restaurant|clinic|store|shop/i);
      if (introMatch) {
         // incremental hint
      }
    }
  };

  const injectUploadWidget = () => {
    const introText = "Great! Now let's teach your agent about your business. You can upload your menu, price list, FAQ document, or any PDF that has information your customers usually ask about. You can also paste a website link if you have one.";
    
    const introMsg = { role: "assistant" as const, content: introText };
    const introBubble = { id: `ai-upload-intro-${Date.now()}`, role: "assistant" as const, content: introText, type: "text" as const };
    
    const widgetBubble = {
      id: `widget-${Date.now()}`,
      role: "system" as const,
      content: "",
      type: "upload-widget" as const
    };

    setConversationHistory(prev => [...prev, introMsg]);
    setChatMessages(prev => [...prev, introBubble, widgetBubble]);
  };

  const handleDocumentWidgetUploaded = (fileName: string) => {
    if (uploadedFilesList.includes(fileName)) return;
    setUploadedFilesList(prev => [...prev, fileName]);

    setIsAiTyping(true);
    setTimeout(() => {
      setIsAiTyping(false);
      const confText = "Got it! I've read through your document and your agent now knows everything in it. Do you want to add anything else — another document, a price list, or a link?";
      
      setConversationHistory(prev => [...prev, { role: "assistant" as const, content: confText }]);
      setChatMessages(prev => [...prev, { 
        id: `ai-conf-${Date.now()}`, 
        role: "assistant" as const, 
        content: confText, 
        type: "text" as const 
      }]);
    }, 1500);
  };

  const handleDocumentWidgetUrlAdded = async (url: string) => {
    if (ingestedUrlsList.includes(url)) return;
    setIngestedUrlsList(prev => [...prev, url]);

    setIsAiTyping(true);
    setTimeout(() => {
      setIsAiTyping(false);
      const confText = "Got it! I've added that to your agent's knowledge base. Do you want to add anything else — another document, a price list, or a link?";
      
      setConversationHistory(prev => [...prev, { role: "assistant" as const, content: confText }]);
      setChatMessages(prev => [...prev, { 
        id: `ai-conf-${Date.now()}`, 
        role: "assistant" as const, 
        content: confText, 
        type: "text" as const 
      }]);
    }, 1200);
  };

  // Conversational Onboarding Deploy Action
  const handleDeployAgentConversational = async () => {
    if (!businessName) {
      showToast("A business name is required to deploy.", "error");
      return;
    }

    setIsDeploying(true);
    try {
      const response = await fetch(getApiUrl("/api/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          business_type: businessType,
          primary_language: primaryLanguage,
          greeting: greeting || undefined,
          restrictions: restrictions,
          top_faqs: topFaqs,
          files: uploadedFilesList,
          urls: ingestedUrlsList
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to configure agent runtime.");
      }

      const data = await response.json();
      setDeployedAgentId(data.agent_id);
      showToast("AI voice agent successfully built and deployed!", "success");
      
      // Navigate to /agent/{id}/ready
      navigate(`/agent/${data.agent_id}/ready`);
    } catch (err) {
      console.error(err);
      showToast("Configuration failed. Please review your details and try again.", "error");
    } finally {
      setIsDeploying(false);
    }
  };

  // Drag and drop mechanics
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        await uploadPdfFile(file);
      } else {
        showToast("Please drop a valid PDF document.", "error");
      }
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadPdfFile(files[0]);
    }
  };

  const uploadPdfFile = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(getApiUrl("/api/upload"), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      setPdfName(file.name);
      showToast(`Successfully uploaded "${file.name}"`, "success");
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlBlur = async () => {
    if (!urlInput || !urlInput.trim()) return;
    setIsIngestingUrl(true);
    try {
      const response = await fetch(getApiUrl("/api/ingest-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      if (!response.ok) {
        throw new Error("URL integration failed");
      }

      showToast("URL contents successfully parsed and added to agent knowledge!", "success");
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setIsIngestingUrl(false);
    }
  };

  const handleDeployAgent = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessName || !businessName.trim()) {
      showToast("Business name is required to deploy.", "error");
      return;
    }

    setIsDeploying(true);
    try {
      const response = await fetch(getApiUrl("/api/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName.trim(),
          greeting: greeting.trim() || undefined
        }),
      });

      if (!response.ok) {
        throw new Error("Deployment configuration failed");
      }

      const data = await response.json();
      setDeployedAgentId(data.agent_id);
      showToast("Voice agent deployed live!", "success");
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setIsDeploying(false);
    }
  };

  const copyToClipboard = () => {
    if (!deployedAgentId) return;
    const url = `${window.location.origin}/agent/${deployedAgentId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      showToast("Agent URL copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      showToast("Failed to copy automatically. Please copy text manually.", "error");
    });
  };

  // ----------------------------------------------------
  // PAGE 2: AGENT CONVERSATION STATE
  // ----------------------------------------------------
  const [agentInfo, setAgentInfo] = useState<{ business_name: string; greeting: string } | null>(null);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [micStatus, setMicStatus] = useState<"Tap to speak" | "Listening..." | "Thinking..." | "Speaking...">("Tap to speak");
  const [userQueryText, setUserQueryText] = useState("");
  const [agentResponseText, setAgentResponseText] = useState("");
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [keyboardQuery, setKeyboardQuery] = useState("");
  const [isKeyboardSubmitting, setIsKeyboardSubmitting] = useState(false);

  // Dynamic Audio playing structures
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Voice recording references
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Load agent specs when view becomes active
  useEffect(() => {
    if (isAgentView && activeAgentId) {
      fetchAgentDetails(activeAgentId);
    }
    // Clean up active playback on navigate or exit
    return () => {
      stopAndCleanupPlayback();
    };
  }, [isAgentView, activeAgentId]);

  const fetchAgentDetails = async (agentId: string) => {
    setIsAgentLoading(true);
    try {
      const response = await fetch(getApiUrl(`/api/agent/${agentId}`));
      if (!response.ok) {
        throw new Error("Failed to pull agent config");
      }
      const data = await response.json();
      setAgentInfo(data);
      // Initialize the dialogue box with the greeting as requested
      setAgentResponseText(data.greeting || "Namaste, how can I help you?");
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setIsAgentLoading(false);
    }
  };

  const stopAndCleanupPlayback = () => {
    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.stop();
      } catch (e) {
        // Already stopped or not started
      }
      activeAudioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
  };

  // Web Audio API playback player
  const playVoiceBlob = async (blob: Blob) => {
    try {
      stopAndCleanupPlayback();
      setMicStatus("Speaking...");

      const arrayBuffer = await blob.arrayBuffer();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      // Decode WAV PCM chunks (or MP3 fallback)
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      
      activeAudioSourceRef.current = source;
      source.onended = () => {
        setMicStatus("Tap to speak");
      };
      
      source.start(0);
    } catch (err) {
      console.error("Audio playback error:", err);
      showToast("Audio playback failed.", "error");
      setMicStatus("Tap to speak");
    }
  };

  // Mic Record Toggle / Hold routines
  const requestMediaStream = async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionDenied(false);
      return stream;
    } catch (err) {
      console.error("Microphone hardware error:", err);
      setMicPermissionDenied(true);
      showToast("Please allow microphone access to use VoiceClaw", "error");
      return null;
    }
  };

  // Start Voice capture
  const handleMicStart = async (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (micStatus === "Thinking..." || micStatus === "Speaking...") return;
    
    // Request sound permission first
    const stream = await requestMediaStream();
    if (!stream) return;

    streamRef.current = stream;
    setMicStatus("Listening...");
    recordedChunksRef.current = [];

    // Choose supported MIME container formats
    let mimeOptions = {};
    if (MediaRecorder.isTypeSupported("audio/webm")) {
      mimeOptions = { mimeType: "audio/webm" };
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      mimeOptions = { mimeType: "audio/mp4" };
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, mimeOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setMicStatus("Thinking...");
        const audioBlob = new Blob(recordedChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        await processAudioFlow(audioBlob);
      };

      mediaRecorder.start();
    } catch (err) {
      console.error("Recording start error", err);
      showToast("Something went wrong. Try again.", "error");
      setMicStatus("Tap to speak");
    }
  };

  // Stop recording on release
  const handleMicStop = (e?: MouseEvent | TouchEvent) => {
    if (e) e.preventDefault();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Core Agent Flow: Audio STT -> Query -> TTS -> Playback
  const processAudioFlow = async (audioBlob: Blob) => {
    try {
      // 1. POST STT
      const formData = new FormData();
      formData.append("audio", audioBlob);
      formData.append("agent_id", activeAgentId || "demo123");

      const sttResponse = await fetch(getApiUrl("/api/stt"), {
        method: "POST",
        body: formData,
      });

      if (!sttResponse.ok) throw new Error("STT failed");
      const sttData = await sttResponse.json();
      const transcribedText = sttData.text;
      const sourceLang = sttData.source_lang;
      
      setUserQueryText(transcribedText);

      // 2. Query
      await submitTextQuery(transcribedText, sourceLang);
    } catch (error) {
      console.error("Voice pipeline processing error:", error);
      showToast("Something went wrong. Try again.", "error");
      setMicStatus("Tap to speak");
    }
  };

  const submitTextQuery = async (text: string, language: string) => {
    try {
      setMicStatus("Thinking...");
      
      const queryResponse = await fetch(getApiUrl("/api/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          source_lang: language,
          agent_id: activeAgentId || "demo123"
        }),
      });

      if (!queryResponse.ok) throw new Error("Query pipeline processing error");
      const queryData = await queryResponse.json();
      const answerText = queryData.answer_text;
      
      setAgentResponseText(answerText);

      // 3. TTS
      const ttsResponse = await fetch(getApiUrl("/api/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: answerText,
          source_lang: language,
        }),
      });

      if (!ttsResponse.ok) throw new Error("TTS voice encoding error");
      const audioBlob = await ttsResponse.blob();

      // 4. Play audio
      await playVoiceBlob(audioBlob);
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Try again.", "error");
      setMicStatus("Tap to speak");
    }
  };

  // Keyboard Fallback Input (for iframe testing sandbox context)
  const handleKeyboardSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!keyboardQuery.trim()) return;
    if (micStatus === "Thinking..." || micStatus === "Speaking...") return;

    const query = keyboardQuery.trim();
    setKeyboardQuery("");
    setUserQueryText(query);
    
    setIsKeyboardSubmitting(true);
    await submitTextQuery(query, "en-US");
    setIsKeyboardSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-slate-200 selection:text-slate-900 overflow-x-hidden antialiased">
      {/* Dynamic Keyframes Injection for Voice Visualizer Bars */}
      <style>{`
        @keyframes wave-pulse {
          0%, 100% { height: 8px; }
          50% { height: 38px; }
        }
        .visualizer-bar {
          animation: wave-pulse 0.7s ease-in-out infinite;
        }
      `}</style>

      {/* Global Toast Alert banner */}
      {toast && (
        <div 
          id="toast-notification"
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm transition-all duration-300 transform translate-y-0 ${
            toast.type === "success" 
              ? "bg-emerald-50 text-emerald-900 border-emerald-200" 
              : toast.type === "error" 
              ? "bg-rose-50 text-rose-900 border-rose-200" 
              : "bg-slate-800 text-white border-slate-700"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* PAGE 1: DEPLOYED SUCCESS READY STAGE (/agent/[id]/ready) */}
      {isReadyState && (
        <div id="page-ready" className="w-full min-h-screen flex flex-col justify-between py-12 px-4 bg-slate-50">
          <div className="w-full max-w-[560px] mx-auto flex-1 flex flex-col justify-center">
            {/* Header branding block */}
            <div className="mb-10 text-center">
              <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" /> Live On Air
              </div>
              <h1 className="text-4xl font-extrabold text-[#0f0f0f] tracking-tight">
                VoiceClaw
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Put your business info on autopilot. Deployed your AI telephone voice agent instantly.
              </p>
            </div>

            <div 
              id="container-deploy-success"
              className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-md space-y-6 text-center"
            >
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900">Your AI voice agent is live!</h2>
                <p className="text-sm text-slate-500">
                  Business owners and customers can immediately call and talk with your deployed agent below.
                </p>
              </div>

              {/* Deployed URL Segment */}
              <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 flex items-center justify-between gap-3 text-left">
                <div className="overflow-hidden">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Deployed Agent Live URL</p>
                  <p className="text-sm font-semibold text-slate-850 truncate select-all mt-0.5" id="text-deployed-url">
                    {window.location.origin}/agent/{activeAgentId}
                  </p>
                </div>
                <button
                  id="btn-copy-url"
                  onClick={() => {
                    const url = `${window.location.origin}/agent/${activeAgentId}`;
                    navigator.clipboard.writeText(url).then(() => {
                      setCopied(true);
                      showToast("Agent URL copied to clipboard!", "success");
                      setTimeout(() => setCopied(false), 2000);
                    }).catch(() => {
                      showToast("Failed to copy automatically. Please copy text manually.", "error");
                    });
                  }}
                  className="shrink-0 p-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-55 text-slate-700 rounded-lg transition-all cursor-pointer"
                  title="Copy agent link"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Navigation button arrays */}
              <div className="grid grid-cols-1 gap-2 pt-2">
                <button
                  id="btn-talk-agent"
                  onClick={() => navigate(`/agent/${activeAgentId}`)}
                  className="w-full flex items-center justify-center gap-2 bg-[#000000] text-white py-3 px-4 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <Mic className="w-4 h-4" /> Talk to your agent
                </button>
                <button
                  id="btn-back-to-builder"
                  onClick={() => {
                    // Reset builder values and go back to onboarding interview
                    setBusinessName("");
                    setBusinessType("");
                    setPrimaryLanguage("");
                    setTopFaqs([]);
                    setRestrictions("");
                    setUploadedFilesList([]);
                    setIngestedUrlsList([]);
                    setChatMessages([
                      {
                        id: "init-msg",
                        role: "assistant",
                        content: "Namaste! Welcome to VoiceClaw. I'm your onboarding assistant. Let's build your live voice agent in just a few quick steps! To start off, what is the name of your business?",
                        type: "text"
                      }
                    ]);
                    setConversationHistory([
                      {
                        role: "assistant",
                        content: "Namaste! Welcome to VoiceClaw. I'm your onboarding assistant. Let's build your live voice agent in just a few quick steps! To start off, what is the name of your business?"
                      }
                    ]);
                    setIsConfigDone(false);
                    navigate("/builder");
                  }}
                  className="w-full text-slate-550 hover:text-slate-950 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  Create another voice agent
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAGE 1: AGENT BUILDER (/builder) */}
      {!isAgentViewState && (
        <div id="page-builder" className="w-full min-h-screen flex flex-col justify-between py-6 px-4 bg-slate-50 font-sans">
          <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
            
            {/* Elegant Header Block */}
            <header className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-slate-900 text-white p-2 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">VoiceClaw</h1>
                  <p className="text-xs text-slate-500">Deploy automated telephone receptionists with live conversational setup</p>
                </div>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-[#0c0c0c] bg-slate-200 px-3 py-1 rounded-full">
                No-code Platform v2.0
              </span>
            </header>

            {/* Mobile Collapsible Config summary */}
            {isConfigDone && (
              <div className="block md:hidden border border-slate-200 bg-white shadow-sm p-4 rounded-xl mb-4 shrink-0">
                <button 
                  onClick={() => setIsMobileConfigExpanded(!isMobileConfigExpanded)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 uppercase"
                >
                  <span className="flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Agent Settings Summary
                  </span>
                  <span>{isMobileConfigExpanded ? "Hide Settings ▲" : "Show Settings ▼"}</span>
                </button>
                {isMobileConfigExpanded && (
                  <div className="mt-4 space-y-4 pt-4 border-t border-slate-100 text-xs">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Business Name</p>
                      <p className="text-sm font-semibold text-slate-900">{businessName || "Not set yet"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Business Type / Category</p>
                      <p className="text-slate-800 font-medium">{businessType || "Not set yet"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Communication Language</p>
                      <p className="text-slate-800 font-medium">{primaryLanguage || "Not set yet"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Active Greeting</p>
                      <p className="text-slate-655 italic font-medium">"{greeting || "Namaste, how can I help you?"}"</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-10 gap-6 flex-1 min-h-0">
              
              {/* CHAT INTERFACE WINDOW (60%) */}
              <div id="chat-window-pane" className="col-span-1 md:col-span-6 bg-white border border-slate-200 rounded-2xl flex flex-col shadow-sm h-[680px] overflow-hidden">
                {/* Chat window header */}
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-650 animate-pulse" />
                    <span className="text-sm font-semibold text-slate-800">Agent Configuration Assistant</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">Live setup connection</span>
                </div>

                {/* Messages stream view container */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40 select-text">
                  {chatMessages.map((msg) => {
                    if (msg.role === "user") {
                      return (
                        <div key={msg.id} className="flex justify-end">
                          <div className="max-w-[75%] bg-slate-900 text-white px-4 py-3 rounded-2xl rounded-tr-none text-sm shadow-sm select-text">
                            {msg.content}
                          </div>
                        </div>
                      );
                    }

                    if (msg.type === "upload-widget") {
                      return (
                        <div key={msg.id} className="bg-white border border-slate-250 p-5 rounded-2xl space-y-4 max-w-sm my-2 self-start shadow-md hover:shadow-lg transition-shadow">
                          <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider pb-1.5 border-b border-slate-100">
                            <FileText className="w-4 h-4 text-slate-505" />
                            <span>Business Knowledge Source</span>
                          </div>
                          
                          {/* File drop area */}
                          <div className="relative border border-dashed border-slate-300 hover:border-slate-800 bg-slate-25/50 p-4 rounded-xl transition-all cursor-pointer text-center group">
                            <input 
                              type="file" 
                              accept=".pdf" 
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 10 * 1024 * 1024) {
                                    showToast("File size exceeded. PDF must be under 10MB.", "error");
                                    return;
                                  }
                                  if (!file.name.endsWith(".pdf")) {
                                    showToast("Only PDF documents are allowed.", "error");
                                    return;
                                  }
                                  setIsUploading(true);
                                  try {
                                    const fd = new FormData();
                                    fd.append("file", file);
                                    const res = await fetch(getApiUrl("/api/upload"), {
                                      method: "POST",
                                      body: fd
                                    });
                                    if (!res.ok) throw new Error("Upload failed");
                                    handleDocumentWidgetUploaded(file.name);
                                  } catch (err) {
                                    showToast("Failed to upload document. Please try again.", "error");
                                  } finally {
                                    setIsUploading(false);
                                  }
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <FileUp className="w-8 h-8 text-slate-400 mx-auto group-hover:scale-110 transition-transform duration-200" />
                            <p className="text-xs font-semibold text-slate-800 mt-2">Upload FAQ, menu, or pricing guide PDF</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">PDF format, max 10MB</p>
                          </div>

                          {/* URL input field */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Add Business Website URL</label>
                            <div className="flex gap-1.5">
                              <input
                                type="url"
                                placeholder="https://mybusiness.com/about"
                                id="widget-url-input"
                                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 bg-slate-50"
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter") {
                                    const target = e.currentTarget;
                                    const val = target.value.trim();
                                    if (!val) return;
                                    setIsIngestingUrl(true);
                                    try {
                                      const res = await fetch(getApiUrl("/api/ingest-url"), {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ url: val })
                                      });
                                      if (!res.ok) throw new Error("Ingestion error");
                                      handleDocumentWidgetUrlAdded(val);
                                      target.value = "";
                                    } catch (err) {
                                      showToast("Failed to ingest URL.", "error");
                                    } finally {
                                      setIsIngestingUrl(false);
                                    }
                                  }
                                }}
                              />
                              <button 
                                onClick={async () => {
                                  const el = document.getElementById("widget-url-input") as HTMLInputElement;
                                  const val = el?.value.trim();
                                  if (!val) return;
                                  setIsIngestingUrl(true);
                                  try {
                                    const res = await fetch(getApiUrl("/api/ingest-url"), {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ url: val })
                                    });
                                    if (!res.ok) throw new Error("Ingestion error");
                                    handleDocumentWidgetUrlAdded(val);
                                    if (el) el.value = "";
                                  } catch (err) {
                                    showToast("Failed to ingest URL.", "error");
                                  } finally {
                                    setIsIngestingUrl(false);
                                  }
                                }}
                                className="px-3 bg-[#0a0a0a] hover:bg-black text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                              >
                                {isIngestingUrl ? "..." : "Add"}
                              </button>
                            </div>
                          </div>

                          {/* Loaded status labels */}
                          {(uploadedFilesList.length > 0 || ingestedUrlsList.length > 0) && (
                            <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Added Ingredients:</p>
                              <div className="flex flex-wrap gap-1">
                                {uploadedFilesList.map((f, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-800 rounded-lg text-[10px] font-semibold border border-emerald-100">
                                    <Check className="w-3 h-3 text-emerald-600" /> {f}
                                  </span>
                                ))}
                                {ingestedUrlsList.map((u, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-800 rounded-lg text-[10px] font-semibold border border-indigo-100">
                                    <Globe className="w-3 h-3 text-indigo-600" /> {u}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (msg.type === "summary-card") {
                      return (
                        <div key={msg.id} className="bg-slate-900 text-white rounded-2xl p-5 my-2 space-y-4 max-w-sm self-start shadow-xl border border-slate-800">
                          <div className="flex items-center gap-2 pb-2.5 border-b border-white/10">
                            <Sparkles className="w-5 h-5 text-amber-300 shrink-0 animate-pulse" />
                            <span className="font-extrabold text-sm uppercase tracking-wider text-amber-50">Final Agent Configuration</span>
                          </div>

                          <div className="space-y-3.5 text-xs text-slate-200">
                            <div>
                              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Business Name</p>
                              <p className="text-sm font-bold text-white mt-0.5">{businessName || "Not set"}</p>
                            </div>
                            
                            <div>
                              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Business Category / Type</p>
                              <p className="text-white mt-0.5">{businessType || "Not set"}</p>
                            </div>

                            <div>
                              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Primary Language</p>
                              <p className="text-white mt-0.5">{primaryLanguage || "Not set"}</p>
                            </div>

                            <div>
                              <p className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Welcome Greeting Message</p>
                              <p className="text-amber-100 italic mt-0.5">"{greeting || "Namaste, how can I help you?"}"</p>
                            </div>

                            {topFaqs.length > 0 && (
                              <div>
                                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Target Customer FAQs</p>
                                <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-300 text-[11px]">
                                  {topFaqs.map((faq, idx) => (
                                    <li key={idx} className="truncate">{faq}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {restrictions && (
                              <div>
                                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Active Guardrails & Restrictions</p>
                                <p className="text-slate-300 mt-0.5 text-[11px] leading-relaxed">{restrictions}</p>
                              </div>
                            )}

                            {(uploadedFilesList.length > 0 || ingestedUrlsList.length > 0) && (
                              <div className="pt-2 border-t border-white/10">
                                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-450">Knowledge Base Ingested</p>
                                <p className="text-slate-400 mt-0.5 text-[11px]">
                                  Loaded {uploadedFilesList.length} business documents and {ingestedUrlsList.length} links.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Full width custom deploy triggers */}
                          <button 
                            type="button"
                            onClick={handleDeployAgentConversational}
                            disabled={isDeploying}
                            className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold py-3.5 px-4 rounded-xl text-sm transition-all duration-200 transform active:scale-98 shadow-md cursor-pointer disabled:opacity-50"
                          >
                            {isDeploying ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                Powering up voice receptionist...
                              </>
                            ) : (
                              <>
                                Deploy my agent now →
                              </>
                            )}
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[75%] bg-white border border-slate-200/80 text-custom-black px-4 py-3 rounded-2xl rounded-tl-none text-sm shadow-sm select-text leading-relaxed whitespace-pre-line">
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing Indicator */}
                  {isAiTyping && (
                    <div className="flex justify-start items-center space-x-2">
                      <div id="bubble-typing-assistant" className="bg-white border border-slate-200/80 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5">
                        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Chat window footer input container */}
                <div className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0">
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendChatMessage();
                    }}
                    className="w-full flex gap-2"
                  >
                    <input
                      type="text"
                      id="input-onboarding"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={isAiTyping}
                      placeholder="Type your response here..."
                      className="flex-grow px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                    />
                    <button
                      type="submit"
                      id="btn-onboarding-send"
                      disabled={isAiTyping || !chatInput.trim()}
                      className="p-3 bg-[#0f0f0f] text-white hover:bg-black rounded-xl transition-all cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>

              {/* LIVE AGENT PREVIEW PANEL (40%) */}
              <div id="live-config-preview-panel" className="hidden md:flex md:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex-col justify-between h-[680px]">
                <div>
                  <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-full bg-slate-150 flex items-center justify-center text-slate-800 shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">Virtual Agent Board</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Live configuration feed</p>
                    </div>
                  </div>

                  {/* Preview details */}
                  <div className="mt-6 space-y-5 select-text">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Business Name</p>
                      <p className={`text-base font-extrabold mt-0.5 ${businessName ? 'text-slate-900' : 'text-slate-300 italic text-sm'}`}>
                        {businessName || "Not set yet"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Merchant Category / Type</p>
                      <p className={`text-xs font-semibold mt-0.5 ${businessType ? 'text-slate-800' : 'text-slate-300 italic'}`}>
                        {businessType || "Not set yet"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Primary Language</p>
                      <p className={`text-xs font-semibold mt-0.5 ${primaryLanguage ? 'text-slate-800' : 'text-slate-300 italic'}`}>
                        {primaryLanguage || "Not set yet"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Active welcome Greeting</p>
                      <p className={`text-xs font-medium leading-relaxed italic mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 ${greeting ? 'text-slate-700' : 'text-slate-300 bg-slate-25/50'}`}>
                        "{greeting || "Namaste, how can I help you?"}"
                      </p>
                    </div>

                    {topFaqs.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">Target Customer Queries</p>
                        <div className="space-y-1">
                          {topFaqs.map((f, i) => (
                            <div key={i} className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded px-2 py-1 truncate">
                              &bull; {f}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {restrictions && (
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">Guardrails / Restrictions</p>
                        <p className="text-[11px] leading-relaxed text-rose-800 bg-rose-25/50 border border-rose-100 rounded px-2.5 py-1.5">
                          {restrictions}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom preview state status summary */}
                <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/50 -mx-6 -mb-6 p-6 rounded-b-2xl shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Loaded business resources:</span>
                    <span className="font-extrabold text-slate-800 text-right">
                      {uploadedFilesList.length + ingestedUrlsList.length} items
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Simple footer branding */}
          <footer className="w-full text-center text-xs text-slate-400 mt-12 pt-4 border-t border-slate-200 shrink-0">
            VoiceClaw Platforms &copy; 2026. Automated receptionist systems.
          </footer>
        </div>
      )}

      {/* PAGE 2: AGENT CONVERSATION (/agent/[id]) */}
      {isAgentView && (
        <div id="page-agent" className="w-full min-h-screen flex flex-col justify-between py-8 px-4 bg-[#0a0a0a] text-white">
          
          {/* Header Bar */}
          <div className="w-full max-w-lg mx-auto flex items-center justify-between pb-6 border-b border-zinc-900">
            <button
              id="btn-nav-back"
              onClick={() => navigate("/builder")}
              className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors py-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Builder
            </button>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold tracking-widest uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Real-time active node
            </div>
          </div>

          <div className="w-full max-w-lg mx-auto flex-1 flex flex-col justify-between py-12">
            
            {/* Top section: Fetching states or display metadata header */}
            <div className="text-center space-y-2">
              {isAgentLoading ? (
                <div className="flex flex-col items-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                  <p className="text-xs text-zinc-505">Loading voice config...</p>
                </div>
              ) : (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900/60 rounded-full border border-zinc-800 text-xs text-emerald-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                  </div>
                  <h2 className="text-3xl font-extrabold tracking-tight mt-2 text-amber-50">
                    {agentInfo?.business_name || "Sri Lakshmi Hotel"}
                  </h2>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Voice response assistant configured with business document resources. Hold down the microphone to talk.
                  </p>
                </>
              )}
            </div>

            {/* Center Area: Recording Mic trigger button */}
            <div className="flex flex-col items-center justify-center py-10 relative">
              {/* Pulsing ring animation while listening */}
              {micStatus === "Listening..." && (
                <div className="absolute w-[180px] h-[180px] bg-white/2 rounded-full border border-white/5 animate-ping opacity-60" />
              )}
              {micStatus === "Listening..." && (
                <div className="absolute w-[130px] h-[130px] bg-white/1 rounded-full border border-white/10 animate-pulse" />
              )}

              {/* Large circular microphone container click bounds */}
              <button
                id="btn-mic-trigger"
                onMouseDown={handleMicStart}
                onMouseUp={() => handleMicStop()}
                onMouseLeave={() => handleMicStop()}
                onTouchStart={handleMicStart}
                onTouchEnd={() => handleMicStop()}
                disabled={micStatus === "Thinking..." || micStatus === "Speaking..." || isAgentLoading}
                className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all focus:outline-none focus:ring-4 focus:ring-zinc-850 select-none ${
                  micStatus === "Listening..."
                    ? "bg-white text-black scale-95 shadow-lg shadow-white/10 cursor-pointer"
                    : micStatus === "Speaking..."
                    ? "bg-zinc-800 text-white cursor-not-allowed border border-emerald-500/40"
                    : micStatus === "Thinking..."
                    ? "bg-zinc-800 text-white cursor-not-allowed border border-zinc-700 hover:brightness-105"
                    : "bg-zinc-900 text-white hover:bg-zinc-850 cursor-pointer border border-zinc-800"
                }`}
                title="Hold down to talk with agent"
              >
                {micStatus === "Thinking..." ? (
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                ) : micStatus === "Speaking..." ? (
                  <Volume2 className="w-8 h-8 text-emerald-400 animate-pulse" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>

              {/* MIC ACTIVE STATUS LABEL */}
              <p className="mt-6 text-sm font-semibold tracking-wide text-zinc-400 uppercase" id="mic-status-label">
                {micStatus}
              </p>

              {/* Micro amplitude Visualizer bars block */}
              {micStatus === "Listening..." && (
                <div className="flex items-center gap-1.5 h-10 mt-5" id="audio-amplitude-visualizer">
                  <div className="w-1.5 bg-white rounded-full visualizer-bar" style={{ animationDelay: "0.15s", animationDuration: "0.75s" }} />
                  <div className="w-1.5 bg-white rounded-full visualizer-bar" style={{ animationDelay: "0.3s", animationDuration: "0.55s" }} />
                  <div className="w-1.5 bg-white rounded-full visualizer-bar" style={{ animationDelay: "0.0s", animationDuration: "0.6s" }} />
                  <div className="w-1.5 bg-white rounded-full visualizer-bar" style={{ animationDelay: "0.45s", animationDuration: "0.8s" }} />
                  <div className="w-1.5 bg-white rounded-full visualizer-bar" style={{ animationDelay: "0.2s", animationDuration: "0.65s" }} />
                </div>
              )}
            </div>

            {/* Bottom dialogue chat area */}
            <div className="space-y-4 px-4">
              {/* Dialogue Transcript Container */}
              <div 
                id="container-dialogue"
                className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-5 space-y-4 max-h-[180px] overflow-y-auto"
              >
                {/* Last User Query text line */}
                {userQueryText && (
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">You</p>
                    <p className="text-sm text-zinc-200 bg-zinc-900 inline-block px-3.5 py-2 rounded-xl rounded-tr-none text-left">
                      "{userQueryText}"
                    </p>
                  </div>
                )}

                {/* Last Agent Response text line */}
                {agentResponseText && (
                  <div className="space-y-1 text-left">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      {agentInfo?.business_name || "Agent"}
                    </p>
                    <p className="text-sm text-zinc-100 bg-zinc-900/60 border border-zinc-850 inline-block px-3.5 py-2 rounded-xl rounded-tl-none">
                      "{agentResponseText}"
                    </p>
                  </div>
                )}

                {/* Default placeholder line */}
                {!userQueryText && !agentResponseText && (
                  <p className="text-xs text-center text-zinc-500 italic py-2">
                    Say something to begin the dialogue sequence.
                  </p>
                )}
              </div>

              {/* Fallback Keyboard query input if mic fails (e.g. iframe context) */}
              <div className="pt-2">
                <form onSubmit={handleKeyboardSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={keyboardQuery}
                    onChange={(e) => setKeyboardQuery(e.target.value)}
                    disabled={micStatus === "Thinking..." || micStatus === "Speaking..." || isKeyboardSubmitting}
                    placeholder="Type simulated query (e.g. Do you have veg biryani?)..."
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-650 focus:outline-none text-zinc-200 placeholder-zinc-500"
                  />
                  <button
                    type="submit"
                    disabled={!keyboardQuery.trim() || micStatus === "Thinking..." || micStatus === "Speaking..." || isKeyboardSubmitting}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    Send
                  </button>
                </form>
              </div>

              {/* Banner indicator if mic block activated */}
              {micPermissionDenied && (
                <div 
                  id="mic-error-banner"
                  className="flex items-center gap-3 bg-rose-950/40 border border-rose-900 p-3.5 rounded-lg text-xs text-rose-200 mt-2"
                >
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  <div>
                    <span className="font-bold">Please allow microphone access to use VoiceClaw.</span> Ensure browser permissions are allowed on the parent frame.
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className="text-center text-[10px] text-zinc-600">
            VoiceClaw Agent ID: <span className="font-mono">{activeAgentId || "demo123"}</span>
          </div>

        </div>
      )}
    </div>
  );
}
