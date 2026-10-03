(() => {
  const tg = window.Telegram?.WebApp;
  const packs = ["60", "120", "180", "240", "325", "385", "660", "720", "985", "1320", "1500", "1800", "2460", "3850", "8100"];

  const state = {
    selectedPackage: ""
  };

  const packageGrid = document.getElementById("packageGrid");
  const selectedPackageInput = document.getElementById("selectedPackage");
  const pubgIdInput = document.getElementById("pubgId");
  const payerNameInput = document.getElementById("payerName");
  const orderForm = document.getElementById("orderForm");
  const formMessage = document.getElementById("formMessage");
  const reviewSheet = document.getElementById("reviewSheet");
  const reviewPackage = document.getElementById("reviewPackage");
  const reviewPubgId = document.getElementById("reviewPubgId");
  const reviewPayerName = document.getElementById("reviewPayerName");
  const closeReviewBtn = document.getElementById("closeReviewBtn");
  const editPreviewBtn = document.getElementById("editPreviewBtn");
  const confirmPreviewBtn = document.getElementById("confirmPreviewBtn");
  const startOrderBtn = document.getElementById("startOrderBtn");
  const supportBtn = document.getElementById("supportBtn");
  const userChip = document.getElementById("userChip");

  if (tg) {
    tg.ready();
    tg.expand();

    const user = tg.initDataUnsafe?.user;
    if (user) {
      userChip.textContent = user.username ? `@${user.username}` : (user.first_name || "Telegram User");
    }
  }

  function renderPackages() {
    packageGrid.innerHTML = "";

    for (const pack of packs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "package-card";
      button.dataset.pack = pack;
      button.innerHTML = `<strong>${pack} UC</strong><span>Price pending</span>`;
      button.addEventListener("click", () => selectPackage(pack));
      packageGrid.appendChild(button);
    }
  }

  function selectPackage(pack) {
    state.selectedPackage = pack;
    selectedPackageInput.value = `${pack} UC`;

    document.querySelectorAll(".package-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.pack === pack);
    });
  }

  function showPage(name) {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active", page.dataset.page === name);
    });

    document.querySelectorAll(".nav-btn").forEach(button => {
      button.classList.toggle("active", button.dataset.target === name);
    });
  }

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.target));
  });

  startOrderBtn.addEventListener("click", () => {
    showPage("shop");
    packageGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  orderForm.addEventListener("submit", event => {
    event.preventDefault();
    formMessage.textContent = "";

    const pubgId = pubgIdInput.value.trim();
    const payerName = payerNameInput.value.trim();

    if (!state.selectedPackage) {
      formMessage.textContent = "Choose a UC package first.";
      return;
    }

    if (!/^\d{5,20}$/.test(pubgId)) {
      formMessage.textContent = "Enter a valid PUBG ID using numbers only.";
      return;
    }

    if (payerName.length < 2) {
      formMessage.textContent = "Enter the payer name.";
      return;
    }

    reviewPackage.textContent = `${state.selectedPackage} UC`;
    reviewPubgId.textContent = pubgId;
    reviewPayerName.textContent = payerName;

    reviewSheet.classList.add("open");
    reviewSheet.setAttribute("aria-hidden", "false");
  });

  function closeReview() {
    reviewSheet.classList.remove("open");
    reviewSheet.setAttribute("aria-hidden", "true");
  }

  closeReviewBtn.addEventListener("click", closeReview);
  editPreviewBtn.addEventListener("click", closeReview);

  confirmPreviewBtn.addEventListener("click", () => {
    closeReview();

    if (tg) {
      tg.showAlert("Mini App UI is ready. Order submission will be connected to your bot and Airtable next.");
    } else {
      formMessage.textContent = "Mini App UI is ready. Backend connection comes next.";
    }
  });

  supportBtn.addEventListener("click", () => {
    if (tg?.openTelegramLink) {
      tg.openTelegramLink("https://t.me/ShanMaACxNo1_UC_bot");
      return;
    }

    window.location.href = "https://t.me/ShanMaACxNo1_UC_bot";
  });

  renderPackages();
})();
