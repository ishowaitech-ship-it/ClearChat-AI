// GloopNext landing-page interactions
// This file is kept separate so you can update the website behavior easily.
document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
});
