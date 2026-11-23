package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
)

func manageCredits(args []string) error {
	if os.Getenv("MANE_AUTH_STAGING") != "1" {
		return errors.New("the credits command requires MANE_AUTH_STAGING=1")
	}
	if len(args) == 0 {
		return errors.New("specify credits balance, grant, or spend")
	}
	action := args[0]
	switch action {
	case "balance", "grant", "spend":
	default:
		return errors.New("specify credits balance, grant, or spend")
	}
	flags := flag.NewFlagSet("credits "+action, flag.ContinueOnError)
	subject := flags.String("subject", "", "Google subject of the test account")
	id := flags.String("id", "", "unique operation ID to reuse on retry")
	amount := flags.Int64("amount", 0, "positive number of credits")
	expiration := flags.String("expires", "", "grant expiration in RFC3339 format")
	if err := flags.Parse(args[1:]); errors.Is(err, flag.ErrHelp) {
		return nil
	} else if err != nil {
		return err
	}
	if *subject == "" || len(*subject) > 256 || flags.NArg() != 0 ||
		(action == "balance" && (*id != "" || *amount != 0)) ||
		(action != "balance" && (*id == "" || *amount <= 0)) ||
		(action != "grant" && *expiration != "") {
		return errors.New("invalid credits arguments; use credits <action> -h")
	}
	var expires time.Time
	if *expiration != "" {
		var err error
		expires, err = time.Parse(time.RFC3339, *expiration)
		if err != nil {
			return errors.New("invalid credit expiration; use RFC3339")
		}
	}
	wallet, err := credits.OpenFromEnv()
	if err != nil {
		return err
	}
	defer wallet.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	switch action {
	case "grant":
		return wallet.Grant(ctx, *subject, *id, *amount, expires)
	case "spend":
		return wallet.Spend(ctx, *subject, *id, *amount)
	default:
		balance, err := wallet.Balance(ctx, *subject)
		if err != nil {
			return err
		}
		fmt.Println(balance)
		return nil
	}
}
