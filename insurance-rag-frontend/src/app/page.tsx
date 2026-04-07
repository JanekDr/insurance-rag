"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileUp, BotMessageSquare, LoaderCircle, CheckCircle2, AlertTriangle, SendHorizontal, FileText, CornerDownLeft, Cpu, Cloud, ShieldAlert } from "lucide-react";
import { GeistSans } from "geist/font/sans";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import { uploadDocument, pollTaskStatus, askQuestion, RateLimitError } from "@/lib/api";
import { RAGResponse, Message } from "@/types";

type ProcessingStatus = "idle" | "uploading" | "processing" | "success" | "error";
type ModelType = "gemini" | "local";

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [errorDetails, setErrorDetails] = useState<string>("");

  const [modelType, setModelType] = useState<ModelType>("gemini");
  const [activeModelType, setActiveModelType] = useState<ModelType>("gemini");
  const [geminiBlocked, setGeminiBlocked] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (geminiBlocked && modelType === "gemini") {
      setModelType("local");
    }
  }, [geminiBlocked, modelType]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile || selectedFile.type !== "application/pdf") {
      toast.error("Błąd pliku", { description: "Proszę wybrać poprawny plik PDF." });
      return;
    }
    await processAndUploadFile(selectedFile);
  };

  const processAndUploadFile = async (selectedFile: File) => {
    setFilename(selectedFile.name);
    setStatus("uploading");
    setMessages([]);
    setDocumentId(null);

    try {
      const uploadRes = await uploadDocument(selectedFile, modelType);
      setStatus("processing");

      const statusRes = await pollTaskStatus(uploadRes.task_id);
      const usedModel = statusRes.result?.model_type || modelType;

      setDocumentId(uploadRes.document_id);
      setActiveModelType(usedModel as ModelType);
      setStatus("success");

      const engineLabel = usedModel === "local" ? "modelem lokalnym" : "Gemini API";
      toast.success("Dokument przeanalizowany", {
        description: `Wczytano ${selectedFile.name} (${engineLabel}). Możesz zadać pytanie.`,
      });

      setMessages([{
        role: "ai",
        content: `Cześć! Przeanalizowałem Ogólne Warunki Ubezpieczenia "${selectedFile.name}" używając silnika ${usedModel === "local" ? "lokalnego" : "Gemini"}. O co chciałbyś zapytać?`
      }]);
    } catch (error) {
      if (error instanceof RateLimitError) {
        setGeminiBlocked(true);
        setStatus("error");
        setErrorDetails(error.message);
        toast.error("Limit Gemini wyczerpany", {
          description: "Opcja Gemini została tymczasowo zablokowana. Użyj modelu lokalnego.",
          duration: 8000,
        });
      } else {
        const err = error as Error;
        setStatus("error");
        setErrorDetails(err.message || "Wystąpił nieoczekiwany błąd.");
        toast.error("Błąd analizy", { description: err.message });
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !documentId || isLlmLoading) return;

    const userQuery = inputMessage.trim();
    setInputMessage("");
    setMessages(prev => [...prev, { role: "user", content: userQuery }]);
    setIsLlmLoading(true);

    try {
      const aiResponse: RAGResponse = await askQuestion(userQuery, documentId, activeModelType);
      setMessages(prev => [...prev, {
        role: "ai",
        content: aiResponse.answer,
        sources: aiResponse.sources
      }]);
    } catch (error) {
      const err = error as Error;
      setMessages(prev => [...prev, {
        role: "ai",
        content: `Przepraszam, wystąpił problem podczas próby kontaktu z modelem AI: ${err.message}`
      }]);
    } finally {
      setIsLlmLoading(false);
    }
  };

  return (
    <div className={`${GeistSans.className} min-h-screen bg-slate-50 text-slate-950 antialiased`}>
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between py-4 max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 p-2.5 rounded-xl shadow-inner">
              <BotMessageSquare className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter">Asystent Ubezpieczeniowy AI</h1>
            <Badge variant="secondary" className="ml-1 text-xs bg-slate-100 border-slate-200">Gemini 2.5 Flash RAG</Badge>
          </div>
          {status === "success" && (
            <div className="flex items-center gap-2 border bg-white px-3 py-1.5 rounded-full shadow-sm">
               <FileText className="h-4 w-4 text-emerald-600" />
               <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]">{filename}</span>
               <Badge className={`${activeModelType === "local"
                 ? "bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-100"
                 : "bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100"
               }`}>
                 {activeModelType === "local" ? "⚡ Lokalny" : "☁️ Gemini"}
               </Badge>
            </div>
          )}
        </div>
      </header>

      <main className="container max-w-7xl mx-auto py-8 px-4">
        <AnimatePresence mode="wait">
          {status !== "success" && (
            <motion.div
              key="upload-screen"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center pt-12"
            >
              <Card className="w-full max-w-2xl shadow-xl border-slate-200 bg-white/50 backdrop-blur-sm overflow-hidden">
                <div className="h-2 w-full bg-gradient-to-r from-slate-900 via-slate-600 to-slate-900" />
                <CardHeader className="text-center pt-8">
                  <CardTitle className="text-4xl font-extrabold tracking-tighter text-slate-950">
                    Przeanalizuj swoje OWU w kilka sekund.
                  </CardTitle>
                  <CardDescription className="text-lg text-slate-600 max-w-lg mx-auto pt-2">
                    Wgraj dokument Ogólnych Warunków Ubezpieczenia (PDF), a nasz asystent AI odpowie na Twoje pytania podając precyzyjne cytaty.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-4">

                  {/* Model Selector */}
                  {(status === "idle" || status === "error") && (
                    <div className="mb-6">
                      <p className="text-sm font-medium text-slate-700 mb-3 text-center">Wybierz silnik wektoryzacji:</p>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Gemini Option */}
                        <button
                          onClick={() => !geminiBlocked && setModelType("gemini")}
                          disabled={geminiBlocked}
                          className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
                            geminiBlocked
                              ? "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed"
                              : modelType === "gemini"
                                ? "border-sky-500 bg-sky-50 shadow-md shadow-sky-100"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                          }`}
                        >
                          <div className={`p-2.5 rounded-lg ${
                            modelType === "gemini" && !geminiBlocked ? "bg-sky-100" : "bg-slate-100"
                          }`}>
                            <Cloud className={`h-6 w-6 ${
                              modelType === "gemini" && !geminiBlocked ? "text-sky-600" : "text-slate-400"
                            }`} />
                          </div>
                          <span className={`font-semibold text-sm ${
                            modelType === "gemini" && !geminiBlocked ? "text-sky-900" : "text-slate-600"
                          }`}>Gemini API</span>
                          <span className="text-[11px] text-slate-500 text-center leading-tight">
                            Wyższa jakość, z limitami API
                          </span>
                          {geminiBlocked && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 rounded-xl backdrop-blur-[1px]">
                              <ShieldAlert className="h-5 w-5 text-amber-500 mb-1" />
                              <span className="text-[11px] font-medium text-amber-700 text-center px-2">Limit wyczerpany — poczekaj</span>
                            </div>
                          )}
                        </button>

                        {/* Local Option */}
                        <button
                          onClick={() => setModelType("local")}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                            modelType === "local"
                              ? "border-violet-500 bg-violet-50 shadow-md shadow-violet-100"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className={`p-2.5 rounded-lg ${
                            modelType === "local" ? "bg-violet-100" : "bg-slate-100"
                          }`}>
                            <Cpu className={`h-6 w-6 ${
                              modelType === "local" ? "text-violet-600" : "text-slate-400"
                            }`} />
                          </div>
                          <span className={`font-semibold text-sm ${
                            modelType === "local" ? "text-violet-900" : "text-slate-600"
                          }`}>Model Lokalny</span>
                          <span className="text-[11px] text-slate-500 text-center leading-tight">
                            Szybki, bez limitów
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  <AnimatePresence mode="wait">
                    {(status === "idle" || status === "uploading") && (
                      <motion.div key="idle" exit={{ opacity: 0 }}>
                        <div
                          className="border-4 border-dashed border-slate-200 rounded-3xl p-12 text-center cursor-pointer bg-slate-50 hover:border-slate-400 hover:bg-slate-100 transition-all group"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {status === "idle" ? (
                            <>
                              <div className="mx-auto bg-white p-5 rounded-full shadow-md w-fit border border-slate-100 group-hover:scale-110 transition-transform">
                                <FileUp className="h-10 w-10 text-slate-700" />
                              </div>
                              <h3 className="mt-6 text-xl font-semibold text-slate-900">Kliknij lub przeciągnij plik PDF</h3>
                              <p className="mt-2 text-sm text-slate-500">Maksymalny rozmiar: 15MB. Tylko format PDF.</p>
                              <Button variant="default" className="mt-8 rounded-full px-8 bg-slate-900 hover:bg-slate-800">
                                Wybierz dokument OWU
                              </Button>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-4 py-8">
                              <LoaderCircle className="h-12 w-12 text-slate-600 animate-spin" />
                              <p className="text-lg font-medium text-slate-800">Wgrywanie pliku do serwera...</p>
                              <Badge variant="outline" className="text-slate-500">{filename}</Badge>
                            </div>
                          )}
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf" className="hidden" />
                      </motion.div>
                    )}
                    {status === "processing" && (
                      <motion.div
                        key="processing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border rounded-3xl p-12 bg-white shadow-inner flex flex-col items-center gap-6"
                      >
                        <div className="relative">
                           <LoaderCircle className="h-20 w-20 text-slate-800 animate-spin opacity-20" />
                           <BotMessageSquare className="h-10 w-10 text-slate-900 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <div className="text-center max-w-md">
                          <h3 className="text-2xl font-bold tracking-tight text-slate-950">Sztuczna Inteligencja analizuje dokument...</h3>
                          <p className="mt-3 text-slate-600">
                            {modelType === "local"
                              ? "Używam modelu lokalnego — bez limitów API. Dokument jest przetwarzany na Twoim serwerze."
                              : "To może potrwać kilka minut. Dokument jest dzielony na fragmenty, z których tworzona jest mapa semantyczna dla bazy wektorowej."
                            }
                          </p>
                        </div>
                        <div className="w-full max-w-sm flex flex-col gap-3 mt-4">
                           <Skeleton className="h-4 w-full bg-slate-100 rounded-full" />
                           <Skeleton className="h-4 w-3/4 bg-slate-100 rounded-full mx-auto" />
                           <div className="flex items-center justify-center gap-2 mt-2">
                             <Badge variant="secondary" className="animate-pulse">{filename}</Badge>
                             <Badge variant="outline" className={`text-[11px] ${
                               modelType === "local"
                                 ? "border-violet-200 text-violet-700 bg-violet-50"
                                 : "border-sky-200 text-sky-700 bg-sky-50"
                             }`}>
                               {modelType === "local" ? "⚡ Lokalny" : "☁️ Gemini"}
                             </Badge>
                           </div>
                        </div>
                      </motion.div>
                    )}
                    {status === "error" && (
                      <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center border border-red-200 rounded-3xl p-10 bg-red-50">
                        <AlertTriangle className="h-12 w-12 text-red-600 mx-auto" />
                        <h3 className="mt-4 text-xl font-semibold text-red-950">Wystąpił błąd podczas przetwarzania</h3>
                        <p className="mt-2 text-sm text-red-800 bg-red-100 p-3 rounded-lg border border-red-200 font-mono">{errorDetails}</p>

                        {geminiBlocked && (
                          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                            <p className="text-sm text-amber-800">
                              <ShieldAlert className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                              Limit Gemini wyczerpany. Wybierz <strong>Model Lokalny</strong> powyżej, aby kontynuować bez oczekiwania.
                            </p>
                          </div>
                        )}

                        <Button variant="destructive" className="mt-6 rounded-full" onClick={() => setStatus("idle")}>
                          Spróbuj ponownie
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {status === "success" && (
            <motion.div
              key="chat-screen"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              <div className="md:col-span-2 flex flex-col h-[calc(100vh-140px)]">
                <Card className="flex-grow flex flex-col border-slate-200 shadow-lg bg-white overflow-hidden rounded-2xl">
                  <ScrollArea className="flex-grow p-6">
                    <div className="space-y-6">
                      {messages.map((msg, index) => (
                        <div key={index} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                          {msg.role === "ai" && (
                            <div className="bg-slate-900 p-2.5 rounded-xl h-fit border shadow-inner mt-1 flex-shrink-0">
                                <BotMessageSquare className="h-5 w-5 text-white" />
                            </div>
                          )}
                          <div className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            <div className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm ${
                              msg.role === "user" 
                                ? "bg-slate-900 text-white rounded-br-none font-medium" 
                                : "bg-slate-100 text-slate-900 rounded-bl-none border"
                            }`}>
                              {msg.content}
                            </div>
                            {(msg.role === "ai" && msg.sources && msg.sources.length > 0) && (
                              <div className="flex flex-wrap gap-1.5 mt-1 ml-1">
                                <span className="text-xs text-slate-500 font-medium pt-1">Źródła:</span>
                                {msg.sources.map((src, sIndex) => (
                                  <Badge key={sIndex} variant="outline" className="text-[11px] bg-white text-slate-700 border-slate-200 rounded-full px-2 py-0.5">
                                    Strona {src.page_number}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isLlmLoading && (
                        <div className="flex gap-3">
                           <div className="bg-slate-900 p-2.5 rounded-xl h-fit border shadow-inner mt-1 flex-shrink-0">
                               <BotMessageSquare className="h-5 w-5 text-white animate-pulse" />
                           </div>
                           <div className="flex flex-col gap-2 w-full max-w-[80%]">
                             <Skeleton className="h-10 w-full bg-slate-100 rounded-2xl rounded-bl-none" />
                             <Skeleton className="h-4 w-24 bg-slate-100 rounded-full ml-1" />
                           </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="border-t p-4 bg-slate-50/50">
                    <div className="relative">
                      <Input
                        placeholder="Zadaj pytanie..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") handleSendMessage(); }}
                        disabled={isLlmLoading}
                        className="rounded-xl pl-4 pr-14 py-6 bg-white border-slate-200 shadow-inner focus-visible:ring-slate-900"
                      />
                      <Button
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={isLlmLoading || !inputMessage.trim()}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 h-10 w-10 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300"
                      >
                        {isLlmLoading ? <LoaderCircle className="animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 pt-2.5 pl-1 text-slate-500">
                      <CornerDownLeft className="h-3.5 w-3.5" />
                      <span className="text-[11px]">Wciśnij Enter, aby wysłać.</span>
                    </div>
                  </div>
                </Card>
              </div>
              <div className="md:col-span-1 space-y-6">
                <Card className="border-slate-200 shadow-lg bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="bg-slate-50 border-b p-5">
                    <CardTitle className="text-lg font-bold flex items-center gap-2.5 tracking-tight">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        Kontekst z dokumentu (RAG)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-600">
                        Poniżej znajdują się fragmenty tekstu z bazy Qdrant.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 h-[calc(100vh-270px)]">
                    <ScrollArea className="h-full">
                       <AnimatePresence mode="wait">
                          {(!messages[messages.length-1]?.sources || messages[messages.length-1]?.role === "user") ? (
                             <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col items-center justify-center text-center p-10 pt-20 text-slate-500 gap-4">
                               <BotMessageSquare className="h-10 w-10 opacity-30" />
                               <p className="text-sm font-medium">Zadaj pytanie, aby zobaczyć<br/>użyte fragmenty źródłowe OWU.</p>
                             </motion.div>
                          ) : (
                             <motion.div initial={{opacity:0}} animate={{opacity:1}} className="p-5 space-y-4">
                                {messages[messages.length-1]?.sources?.map((src, index) => (
                                    <motion.div
                                      key={index}
                                      initial={{opacity:0, y:10}}
                                      animate={{opacity:1, y:0}}
                                      transition={{delay: index*0.1}}
                                      className="border rounded-xl p-4 bg-slate-50 shadow-inner"
                                    >
                                       <div className="flex items-center justify-between gap-2 border-b pb-2 mb-2">
                                          <Badge variant="secondary" className="font-mono bg-white border border-slate-200 text-slate-800">
                                              Strona {src.page_number}
                                          </Badge>
                                          <span className="text-[10px] text-slate-400 font-mono truncate">{documentId?.substring(0,8)}...</span>
                                       </div>
                                       <p className="text-xs text-slate-700 leading-relaxed italic">
                                          &quot;...{src.text_snippet}...&quot;
                                       </p>
                                    </motion.div>
                                ))}
                             </motion.div>
                          )}
                       </AnimatePresence>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <footer className="py-6 mt-12 border-t bg-white">
        <div className="container max-w-7xl mx-auto px-4 text-center text-xs text-slate-500">
          Projekt Portfolio: Backend RAG (Python/FastAPI) + Frontend (Next.js/TS).
          Gemini 2.5 Flash, Qdrant, Celery, Redis. &copy; 2026
        </div>
      </footer>
    </div>
  );
}