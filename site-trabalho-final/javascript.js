function initializeChartSwitcher(buttonSelector, chartSelector, activeClass) {
    const buttons = document.querySelectorAll(buttonSelector);
    const charts = document.querySelectorAll(chartSelector);
    buttons.forEach((button, index) => {
        button.addEventListener("click", () => {
            buttons.forEach((btn) => btn.classList.remove(activeClass));
            charts.forEach((chart) => chart.classList.remove(activeClass));
            button.classList.add(activeClass);
            charts[index].classList.add(activeClass);
        });
    });
    if (buttons.length > 0) {
        buttons[0].classList.add(activeClass);
        charts[0].classList.add(activeClass);
    }
}
// Inicializar os dois conjuntos de gráficos
initializeChartSwitcher(".button-container-zero button", ".chart-container-zero iframe", "active-zero");
//initializeChartSwitcher(".button-container-um button", ".chart-container-um iframe", "active-um");
