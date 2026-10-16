# shellcheck shell=sh
# Login shells (VS Code terminals, `agentic-devbox shell`) reset PATH in /etc/profile.
# Put the agentic-devbox runtime commands (docker bridge client, devbox-browser, ...) back.
case ":${PATH}:" in
  *:/opt/agentic-devbox/bin:*) ;;
  *) PATH="/opt/agentic-devbox/bin:${PATH}" ;;
esac
export PATH
