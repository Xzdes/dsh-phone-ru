/**
 * dsh-phone-ru — веб-половина.
 *
 * Кнопка «📱» в строке поля ввода (conversation.input.right). Клик →
 * оверлей с QR-кодом, адресом и PIN для подключения телефона по локалке.
 *
 * Формат client-модуля (как в dsh-snip-ru): window.__ModuleLoader__.load
 * с CJS-фабрикой; id ОБЯЗАН совпадать с именем пакета.
 * Никаких import/export и window.Components — только require("react")
 * и собственные DOM-элементы: чужой API может не существовать.
 */
window.__ModuleLoader__.load({
	id: "dsh-phone-ru",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");

		var inject = ["slots"];
		var PREFIX = "/api/phone-ru";
		var STYLE_ID = "dsh-phone-ru-styles";

		var CSS = `
.dphone-tool { box-sizing: border-box; display: inline-flex; align-items: center;
  gap: 5px; height: 30px; padding: 0 10px; border: 0; border-radius: 8px;
  background: transparent; color: currentColor; cursor: pointer; opacity: .8;
  font: inherit; font-size: 13px; }
.dphone-tool:hover { opacity: 1; background: rgba(127,127,127,.16); }
.dphone-backdrop { position: fixed; inset: 0; z-index: 2147483000;
  background: rgba(0,0,0,.55); display: flex; align-items: center;
  justify-content: center; font: 14px/1.5 system-ui, sans-serif; }
.dphone-card { background: var(--dsw-alias-bg-primary, #1c1f2a); color: inherit;
  border-radius: 14px; padding: 22px 26px; width: min(92vw, 360px);
  box-shadow: 0 16px 48px rgba(0,0,0,.5); text-align: center; }
.dphone-card h3 { margin: 0 0 4px; font-size: 17px; }
.dphone-sub { color: #9aa0ae; font-size: 12.5px; margin: 0 0 14px; }
.dphone-qr { background: #fff; border-radius: 12px; padding: 12px; display: inline-block; }
.dphone-qr svg { display: block; width: 220px; height: 220px; }
.dphone-url { margin-top: 12px; font-size: 14px; word-break: break-all;
  font-family: ui-monospace, Consolas, monospace; }
.dphone-pin { margin-top: 6px; font-size: 26px; letter-spacing: 7px; font-weight: 700; }
.dphone-hint { margin-top: 12px; color: #9aa0ae; font-size: 12.5px; }
.dphone-close { margin-top: 14px; padding: 8px 22px; border: 0; border-radius: 8px;
  background: #2f6feb; color: #fff; font-size: 14px; cursor: pointer; }
.dphone-err { color: #ff8a8a; }
`;

		function ensureStyles() {
			if (document.getElementById(STYLE_ID) !== null) return;
			var el = document.createElement("style");
			el.id = STYLE_ID;
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/** Оверлей с QR / адресом / PIN. Esc или клик по фону — закрыть. */
		function PhoneOverlay(props) {
			var infoPair = React.useState(null);
			var info = infoPair[0];
			var setInfo = infoPair[1];
			var errPair = React.useState(null);
			var error = errPair[0];
			var setError = errPair[1];

			React.useEffect(function () {
				var alive = true;
				fetch(PREFIX + "/info")
					.then(function (r) { return r.json(); })
					.then(function (data) { if (alive) setInfo(data); })
					.catch(function () { if (alive) setError("Не удалось получить данные. Плагин запущен?"); });
				function onKey(event) {
					if (event.key === "Escape") { event.preventDefault(); props.onClose(); }
				}
				window.addEventListener("keydown", onKey, true);
				return function () { alive = false; window.removeEventListener("keydown", onKey, true); };
			}, [props]);

			var body;
			if (error !== null) {
				body = React.createElement("p", { className: "dphone-err" }, error);
			} else if (info === null) {
				body = React.createElement("p", null, "Загрузка…");
			} else {
				body = [
					React.createElement("div", {
						key: "qr", className: "dphone-qr",
						dangerouslySetInnerHTML: { __html: info.qr },
					}),
					React.createElement("div", { key: "url", className: "dphone-url" }, info.url),
					React.createElement("div", { key: "pin", className: "dphone-pin" }, "PIN: " + info.pin),
					React.createElement("div", { key: "hint", className: "dphone-hint" },
						"Телефон в той же Wi-Fi сети: наведите камеру на QR или введите адрес в браузере, затем PIN."),
				];
			}

			return React.createElement("div", {
				className: "dphone-backdrop",
				onClick: props.onClose,
			}, React.createElement("div", {
				className: "dphone-card",
				onClick: function (event) { event.stopPropagation(); },
			},
				React.createElement("h3", null, "📱 Доступ с телефона"),
				React.createElement("p", { className: "dphone-sub" }, "Весь DSH в браузере телефона"),
				body,
				React.createElement("button", {
					type: "button", className: "dphone-close", onClick: props.onClose,
				}, "Закрыть")
			));
		}

		function PhoneButton() {
			var openPair = React.useState(false);
			var open = openPair[0];
			var setOpen = openPair[1];
			return React.createElement(React.Fragment, null,
				React.createElement("button", {
					type: "button",
					className: "dphone-tool",
					title: "Доступ с телефона (QR-код)",
					onClick: function () { setOpen(true); },
				}, "📱"),
				open ? React.createElement(PhoneOverlay, {
					onClose: function () { setOpen(false); },
				}) : null
			);
		}

		function apply(ctx) {
			ensureStyles();
			ctx.inject(["slots"], function (scope) {
				var slots = scope.slots;
				slots.inject("conversation.input.right", function () {
					return slots.register({
						name: "conversation.input.right",
						id: "phone-ru",
						order: 85,
						label: function () { return "Телефон"; },
					}, PhoneButton);
				});
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
