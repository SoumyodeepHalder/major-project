$(function () {
  const PRIMARY_MODEL = "gemini-3.6-flash";
  const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
  const PREFERRED_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.5-pro",
    "gemini-3.5-pro",
    "gemini-pro-latest",
  ];
  const STORAGE_KEY = "courseforge.geminiKey";
  const DEFAULT_KEY =
    "AQ.Ab8RN6KXius4VztGaxrlAOaXLIu3WuSnLYQjlpUgeaUFxnUDwg";

  const files = [];
  let course = null;
  let activeKey = "overview";

  const saved = localStorage.getItem(STORAGE_KEY);
  $("#api-key").val(saved || DEFAULT_KEY);

  $("#dropzone").on("click", function () {
    $("#pdf-input").trigger("click");
  });

  $("#dropzone")
    .on("dragover", function (e) {
      e.preventDefault();
      $(this).addClass("dropzone-active");
    })
    .on("dragleave drop", function (e) {
      e.preventDefault();
      $(this).removeClass("dropzone-active");
    })
    .on("drop", function (e) {
      addFiles(e.originalEvent.dataTransfer.files);
    });

  $("#pdf-input").on("change", function () {
    addFiles(this.files);
    this.value = "";
  });

  $("#generate-btn").on("click", generateCourse);
  $("#export-json").on("click", exportJson);
  $("#print-course").on("click", function () {
    window.print();
  });
  $("#api-key").on("change", function () {
    localStorage.setItem(STORAGE_KEY, $(this).val().trim());
  });

  function addFiles(fileList) {
    Array.from(fileList).forEach(function (file) {
      if (file.type !== "application/pdf") {
        setStatus("Only PDF files are accepted.", true);
        return;
      }
      if (files.some(function (f) { return f.name === file.name && f.size === file.size; })) {
        return;
      }
      files.push(file);
    });
    renderFiles();
  }

  function renderFiles() {
    const $list = $("#file-list").empty();
    if (!files.length) return;
    files.forEach(function (file, index) {
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      const $row = $(
        '<li class="flex items-center justify-between rounded-lg bg-paper px-3 py-2">' +
          '<span class="truncate pr-3">' +
          escapeHtml(file.name) +
          ' <span class="text-stone-500">(' +
          mb +
          " MB)</span></span></li>"
      );
      const $btn = $(
        '<button type="button" class="text-xs font-medium text-clay hover:underline">Remove</button>'
      );
      $btn.on("click", function () {
        files.splice(index, 1);
        renderFiles();
      });
      $row.append($btn);
      $list.append($row);
    });
  }

  function setStatus(message, isError) {
    $("#status")
      .removeClass("hidden text-red-700 text-moss")
      .addClass(isError ? "text-red-700" : "text-moss")
      .text(message);
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result);
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function generateCourse() {
    const apiKey = $("#api-key").val().trim();
    if (!apiKey) {
      setStatus("Add a Gemini API key from Google AI Studio.", true);
      return;
    }
    if (!files.length) {
      setStatus("Add at least one PDF.", true);
      return;
    }

    localStorage.setItem(STORAGE_KEY, apiKey);
    $("#generate-btn").prop("disabled", true);
    setStatus("Reading PDFs and choosing an available Gemini model…");

    try {
      const parts = [];
      for (let i = 0; i < files.length; i += 1) {
        const data = await fileToBase64(files[i]);
        parts.push({
          inline_data: {
            mime_type: "application/pdf",
            data: data,
          },
        });
      }

      const title = $("#course-title").val().trim();
      const audience = $("#audience").val().trim() || "students";
      const pace = $("#pace").val();

      parts.push({
        text:
          "You are an expert instructional designer. Create " +
          pace +
          " strictly from the attached PDF source material. Do not invent facts that contradict the PDFs. If the PDFs are thin on a subtopic, say so in the lesson and teach from what is present.\n\n" +
          "Audience: " +
          audience +
          "\n" +
          (title ? "Preferred title: " + title + "\n" : "") +
          "Source file names: " +
          files.map(function (f) { return f.name; }).join(", ") +
          "\n\n" +
          "Return JSON only, matching this shape:\n" +
          JSON.stringify({
            title: "string",
            subtitle: "string",
            level: "string",
            estimatedHours: "string",
            overview: "string, 2-4 paragraphs",
            prerequisites: ["string"],
            learningOutcomes: ["string"],
            modules: [
              {
                title: "string",
                summary: "string",
                lessons: [
                  {
                    title: "string",
                    objectives: ["string"],
                    content: "string with paragraphs, use \\n\\n between paragraphs. Teach the material, do not only outline it.",
                    keyTerms: [{ term: "string", definition: "string" }],
                    examples: ["string"],
                  },
                ],
                quiz: [
                  {
                    question: "string",
                    options: ["A", "B", "C", "D"],
                    answerIndex: 0,
                    explanation: "string",
                  },
                ],
              },
            ],
            capstone: {
              title: "string",
              brief: "string",
              rubric: ["string"],
            },
            furtherReading: ["prompts for what to reread in the source PDFs"],
          }),
      });

      const payload = {
        contents: [{ role: "user", parts: parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
          maxOutputTokens: 16384,
        },
      };

      const models = await resolveModelQueue(apiKey);
      const result = await generateWithFallback(apiKey, models, payload);
      const text = extractText(result.response);
      course = JSON.parse(stripFences(text));
      activeKey = "overview";
      renderCourse();
      if (result.model === PRIMARY_MODEL && result.attempts === 1) {
        setStatus("Course ready with " + result.model + ". Review before you teach it.");
      } else {
        setStatus(
          "Course ready with " +
            result.model +
            " after " +
            result.attempts +
            " attempt(s). Earlier models were busy or unavailable."
        );
      }
    } catch (err) {
      const detail = formatError(err);
      setStatus(detail, true);
    } finally {
      $("#generate-btn").prop("disabled", false);
    }
  }

  async function resolveModelQueue(apiKey) {
    const listed = await listAccessibleModels(apiKey);
    const ranked = rankModels(listed);
    if (ranked.length) return ranked;
    return PREFERRED_MODELS.slice();
  }

  async function listAccessibleModels(apiKey) {
    try {
      const data = await $.ajax({
        url: API_ROOT + "/models?pageSize=200",
        method: "GET",
        headers: { "x-goog-api-key": apiKey },
      });
      return (data.models || [])
        .filter(function (model) {
          return (model.supportedGenerationMethods || []).indexOf("generateContent") !== -1;
        })
        .map(function (model) {
          return String(model.name || "").replace(/^models\//, "");
        })
        .filter(function (name) {
          if (!/^gemini/i.test(name)) return false;
          return !/(embed|embedding|tts|image|imagen|veo|robotics|computer-use|native-audio)/i.test(
            name
          );
        });
    } catch (err) {
      return PREFERRED_MODELS.slice();
    }
  }

  function rankModels(names) {
    const listed = {};
    names.forEach(function (name) {
      if (name) listed[name] = true;
    });
    const hasCatalog = names.length > 0;
    const queue = [];

    function add(name, force) {
      if (!name || queue.indexOf(name) !== -1) return;
      if (hasCatalog && !force && !listed[name]) return;
      queue.push(name);
    }

    add(PRIMARY_MODEL, true);
    PREFERRED_MODELS.forEach(add);

    names
      .filter(function (name) {
        return /flash/i.test(name) && !/preview|exp|thinking|image/i.test(name);
      })
      .sort(function (a, b) {
        return modelFamilyScore(a) - modelFamilyScore(b);
      })
      .forEach(add);

    names
      .filter(function (name) {
        return /pro/i.test(name) && !/preview|exp/i.test(name);
      })
      .forEach(add);

    if (!queue.length) return PREFERRED_MODELS.slice();
    return queue.slice(0, 10);
  }

  function modelFamilyScore(name) {
    const n = name.toLowerCase();
    if (n.indexOf("flash-lite") !== -1) return 2;
    if (n.indexOf("flash") !== -1) return 1;
    if (n.indexOf("pro") !== -1) return 3;
    return 4;
  }

  function isCapacityOrUnavailable(err) {
    const status = err && err.status;
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    const message = String(formatError(err)).toLowerCase();
    return (
      message.indexOf("high demand") !== -1 ||
      message.indexOf("unavailable") !== -1 ||
      message.indexOf("overloaded") !== -1 ||
      message.indexOf("capacity") !== -1 ||
      message.indexOf("try again later") !== -1 ||
      message.indexOf("resource_exhausted") !== -1 ||
      message.indexOf("resource exhausted") !== -1 ||
      message.indexOf("no capacity") !== -1
    );
  }

  function isSkippableModel(err) {
    const status = err && err.status;
    if (status === 404) return true;
    const message = String(formatError(err)).toLowerCase();
    return (
      message.indexOf("not found") !== -1 ||
      message.indexOf("no longer available") !== -1 ||
      message.indexOf("not supported") !== -1 ||
      message.indexOf("not available to") !== -1
    );
  }

  async function generateWithFallback(apiKey, models, payload) {
    let lastError = null;
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i];
      setStatus("Asking " + model + " (" + (i + 1) + "/" + models.length + ")… this can take a minute.");
      try {
        const response = await $.ajax({
          url: API_ROOT + "/models/" + encodeURIComponent(model) + ":generateContent",
          method: "POST",
          contentType: "application/json",
          headers: { "x-goog-api-key": apiKey },
          data: JSON.stringify(payload),
        });
        return { response: response, model: model, attempts: i + 1 };
      } catch (err) {
        lastError = err;
        if (isCapacityOrUnavailable(err) || isSkippableModel(err)) {
          continue;
        }
        throw err;
      }
    }
    const failed = new Error(
      "Every available Gemini model failed. Last error: " + formatError(lastError)
    );
    failed.status = lastError && lastError.status;
    failed.responseJSON = lastError && lastError.responseJSON;
    throw failed;
  }

  function extractText(response) {
    const parts =
      (((response || {}).candidates || [])[0] || {}).content || {};
    const list = parts.parts || [];
    const texts = list
      .filter(function (p) {
        return p.text && !p.thought;
      })
      .map(function (p) {
        return p.text;
      });
    if (texts.length) return texts.join("\n");
    throw new Error(JSON.stringify(response.error || response, null, 2));
  }

  function stripFences(text) {
    return String(text)
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  function formatError(err) {
    if (err && err.responseJSON && err.responseJSON.error) {
      return err.responseJSON.error.message || JSON.stringify(err.responseJSON.error);
    }
    if (err && err.status === 0) {
      return "Network or CORS error. Serve this folder over http (not a blocked file URL) and check the API key.";
    }
    if (err && err.responseText) return err.responseText.slice(0, 400);
    return (err && err.message) || "Generation failed.";
  }

  function renderCourse() {
    $("#empty-state").addClass("hidden");
    $("#course-view").removeClass("hidden");
    $("#course-kicker").text(
      [course.level, course.estimatedHours].filter(Boolean).join(" · ")
    );
    $("#course-heading").text(course.title || "Untitled course");
    renderOutline();
    renderPanel();
  }

  function renderOutline() {
    const $nav = $("#outline").empty();
    $nav.append(navButton("overview", "Overview"));
    (course.modules || []).forEach(function (mod, mi) {
      $nav.append(
        $('<p class="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-stone-500"></p>').text(
          "Module " + (mi + 1)
        )
      );
      $nav.append(navButton("m-" + mi, mod.title || "Untitled module"));
      (mod.lessons || []).forEach(function (lesson, li) {
        $nav.append(navButton("m-" + mi + "-l-" + li, "  " + (lesson.title || "Lesson")));
      });
      $nav.append(navButton("m-" + mi + "-q", "Quiz"));
    });
    $nav.append(navButton("capstone", "Capstone"));
  }

  function navButton(key, label) {
    const active = key === activeKey;
    const $btn = $(
      '<button type="button" class="mb-1 block w-full rounded-lg px-2 py-1.5 text-left text-sm ' +
        (active ? "bg-moss text-white" : "hover:bg-paper") +
        '"></button>'
    ).text(label);
    $btn.on("click", function () {
      activeKey = key;
      renderOutline();
      renderPanel();
    });
    return $btn;
  }

  function renderPanel() {
    const $panel = $("#lesson-panel").empty();
    if (activeKey === "overview") {
      $panel.append($('<h3 class="font-display text-xl font-semibold"></h3>').text(course.subtitle || "Course overview"));
      $panel.append(
        $('<div class="prose-lesson mt-4 whitespace-pre-wrap text-stone-700"></div>').text(course.overview || "")
      );
      $panel.append(sectionList("Learning outcomes", course.learningOutcomes));
      $panel.append(sectionList("Prerequisites", course.prerequisites));
      return;
    }
    if (activeKey === "capstone") {
      const cap = course.capstone || {};
      $panel.append($('<h3 class="font-display text-xl font-semibold"></h3>').text(cap.title || "Capstone"));
      $panel.append(
        $('<div class="prose-lesson mt-4 whitespace-pre-wrap text-stone-700"></div>').text(cap.brief || "")
      );
      $panel.append(sectionList("Rubric", cap.rubric));
      $panel.append(sectionList("Revisit in the PDFs", course.furtherReading));
      return;
    }

    const parts = activeKey.split("-");
    const mi = Number(parts[1]);
    const mod = (course.modules || [])[mi] || {};
    if (parts[2] === "q") {
      renderQuiz($panel, mod);
      return;
    }
    if (parts[2] === "l") {
      const lesson = (mod.lessons || [])[Number(parts[3])] || {};
      $panel.append($('<p class="text-xs uppercase tracking-wide text-clay"></p>').text(mod.title || ""));
      $panel.append($('<h3 class="font-display text-xl font-semibold"></h3>').text(lesson.title || "Lesson"));
      $panel.append(sectionList("Objectives", lesson.objectives));
      $panel.append(
        $('<div class="prose-lesson mt-4 whitespace-pre-wrap leading-relaxed text-stone-800"></div>').text(
          lesson.content || ""
        )
      );
      if ((lesson.keyTerms || []).length) {
        $panel.append($('<h4 class="mt-6 font-semibold">Key terms</h4>'));
        const $dl = $('<dl class="mt-2 space-y-2"></dl>');
        lesson.keyTerms.forEach(function (item) {
          $dl.append($('<dt class="font-medium text-moss"></dt>').text(item.term || item));
          if (item.definition) {
            $dl.append($('<dd class="text-sm text-stone-700"></dd>').text(item.definition));
          }
        });
        $panel.append($dl);
      }
      $panel.append(sectionList("Examples", lesson.examples));
      return;
    }

    $panel.append($('<h3 class="font-display text-xl font-semibold"></h3>').text(mod.title || "Module"));
    $panel.append(
      $('<div class="prose-lesson mt-4 whitespace-pre-wrap text-stone-700"></div>').text(mod.summary || "")
    );
    $panel.append(
      sectionList(
        "Lessons",
        (mod.lessons || []).map(function (l) {
          return l.title;
        })
      )
    );
  }

  function renderQuiz($panel, mod) {
    $panel.append($('<h3 class="font-display text-xl font-semibold"></h3>').text((mod.title || "Module") + " — quiz"));
    (mod.quiz || []).forEach(function (q, qi) {
      const $card = $('<div class="mt-5 rounded-xl border border-stone-200 p-4"></div>');
      $card.append($('<p class="font-medium"></p>').text(qi + 1 + ". " + (q.question || "")));
      const $opts = $('<div class="mt-3 space-y-2"></div>');
      (q.options || []).forEach(function (opt, oi) {
        const $opt = $(
          '<button type="button" class="block w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:bg-paper"></button>'
        ).text(opt);
        $opt.on("click", function () {
          $opts.find("button").removeClass("border-moss bg-emerald-50 border-red-400 bg-red-50");
          const correct = Number(q.answerIndex) === oi;
          $opt.addClass(correct ? "border-moss bg-emerald-50" : "border-red-400 bg-red-50");
          $card.find(".explain").removeClass("hidden");
        });
        $opts.append($opt);
      });
      $card.append($opts);
      $card.append(
        $('<p class="explain mt-3 hidden text-sm text-stone-600"></p>').text(q.explanation || "")
      );
      $panel.append($card);
    });
  }

  function sectionList(title, items) {
    if (!items || !items.length) return $();
    const $wrap = $('<div class="mt-6"></div>');
    $wrap.append($('<h4 class="font-semibold"></h4>').text(title));
    const $ul = $('<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700"></ul>');
    items.forEach(function (item) {
      $ul.append($("<li></li>").text(typeof item === "string" ? item : JSON.stringify(item)));
    });
    $wrap.append($ul);
    return $wrap;
  }

  function exportJson() {
    if (!course) return;
    const blob = new Blob([JSON.stringify(course, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (course.title || "course").replace(/\s+/g, "-").toLowerCase() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
